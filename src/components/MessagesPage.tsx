import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import "../messages.css";
import "../inbox.css";
import phoneAppIcon from "../assets/phone-app.jpg";
// Sample portraits: randomuser.me/api/portraits/men/96.jpg and /women/63.jpg.
// These placeholders are never assigned to real SMS senders.
import riverbendAvatar from "../assets/riverbend-contact.jpg";
import cornerCafeAvatar from "../assets/corner-cafe-contact.jpg";
import type { FarmState, Order } from "../lib/planning";
import { makePlan } from "../lib/planning";
import { api } from "../lib/api";
import { extractLocally, sampleMessages, smsBody } from "../lib/messages";
import type {
  ExtractedOrder,
  InboxMessage,
  MessagingStatus,
  SmsProposal,
} from "../lib/messages";
import {
  BatteryFull,
  CellularNetwork,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  ClipboardList,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Refresh,
  Settings2,
  Trash2,
  X,
} from "../icons";

type Props = {
  state: FarmState;
  workspace: string;
  revision: string;
  status: MessagingStatus | null;
  connectionError: string;
  tab: "inbox" | "phone";
  onTab: (tab: "inbox" | "phone") => void;
  onRefresh: () => Promise<void>;
  onReview: (
    message: InboxMessage,
    action: "new" | "replace" | "cancel" | "ignore",
    order: Order,
  ) => void;
  onEditRequest: (target: number) => void;
  onDeleteMessage: (id: string, deleted: boolean) => void;
  onPastedMessages: (messages: InboxMessage[]) => void;
};
const clockTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const sampleContactAvatars: Record<string, string> = {
  "sample-message-amend": riverbendAvatar,
  "sample-message-new": cornerCafeAvatar,
};

function MessageAvatar({ message }: { message: InboxMessage }) {
  const portrait =
    message.source === "sample" ? sampleContactAvatars[message.id] : undefined;
  return (
    <span className="message-avatar" aria-hidden="true">
      {portrait ? (
        <img src={portrait} alt="" draggable={false} />
      ) : (
        message.from
          .split(" ")
          .map((word) => word[0])
          .slice(0, 2)
          .join("")
      )}
    </span>
  );
}

function MessageDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>("textarea, input")?.focus();
    const element = ref.current;
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog message-dialog"
      aria-labelledby="message-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="message-dialog-heading">
        <div>
          <h2 id="message-dialog-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close message input"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function MessagesPage(props: Props) {
  const { state, status, tab, onTab } = props;
  const [pasted, setPasted] = useState<InboxMessage[]>(() => {
    if (state.pastedMessages) return state.pastedMessages;
    try {
      const stored = JSON.parse(
        localStorage.getItem("harvest-pasted-messages") || "[]",
      );
      return Array.isArray(stored)
        ? stored.filter(
            (m) =>
              typeof m?.id === "string" &&
              typeof m?.body === "string" &&
              typeof m?.from === "string" &&
              typeof m?.receivedAt === "string",
          )
        : [];
    } catch {
      return [];
    }
  });
  const [selectedId, setSelectedId] = useState("sample-message-amend");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "trash">("all");
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mobileMessageOpen, setMobileMessageOpen] = useState(false);
  const allMessages = [...(status?.inbox || []), ...pasted, ...sampleMessages];
  const messages = allMessages.filter(
    (m) => !state.deletedMessages?.includes(m.id),
  );
  const trash = allMessages.filter((m) =>
    state.deletedMessages?.includes(m.id),
  );
  const pending = messages.filter(
    (m) => !state.reviewedMessages?.includes(m.id),
  );
  const visibleMessages = (
    filter === "trash" ? trash : filter === "pending" ? pending : messages
  ).filter((message) =>
    `${message.from} ${message.body}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected =
    visibleMessages.find((message) => message.id === selectedId) ||
    visibleMessages[0];
  return (
    <>
      <div className="page-heading messages-page-heading">
        <div>
          <h1>Messages</h1>
          <p>Review customer messages and send the morning plan.</p>
        </div>
        <button
          className="button secondary heading-action"
          onClick={() => {
            onTab("inbox");
            setPasteOpen((v) => !v);
          }}
        >
          <Plus size={16} />
          Paste a message
        </button>
      </div>
      <div className="messaging-tabs">
        <div role="tablist" aria-label="Message views">
          <button
            role="tab"
            aria-selected={tab === "inbox"}
            onClick={() => {
              onTab("inbox");
              setMobileMessageOpen(false);
            }}
          >
            <MessageSquare size={16} />
            Order inbox <span>{pending.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "phone"}
            onClick={() => onTab("phone")}
          >
            <Phone size={16} />
            Farmer SMS
          </button>
        </div>
        <span
          className="connection-label"
          role="status"
          title={
            tab === "inbox"
              ? props.connectionError ||
                "New messages appear automatically while connected."
              : status?.campaignMessage
          }
        >
          <span
            className={`connection-dot ${(tab === "inbox" ? status && !props.connectionError : status?.ready) ? "connected" : ""}`}
          />
          {tab === "inbox"
            ? props.connectionError
              ? "Inbox reconnecting…"
              : status
                ? "Live inbox"
                : "Connecting inbox…"
            : status?.ready
              ? "Twilio connected"
              : ["IN_PROGRESS", "PENDING"].includes(
                    status?.campaignStatus || "",
                  )
                ? "Carrier review pending"
                : status?.campaignStatus === "CHECKING"
                  ? "Checking carrier status…"
                  : "Demo available"}
          {tab === "inbox" && props.connectionError && (
            <button
              className="text-button"
              onClick={() => void props.onRefresh()}
              aria-label="Reconnect inbox"
            >
              <Refresh size={14} /> Retry
            </button>
          )}
        </span>
      </div>
      {tab === "inbox" ? (
        <>
          {pasteOpen && (
            <MessageDialog
              title="Add a customer message"
              description="Paste the original text. You’ll check the details before anything changes."
              onClose={() => setPasteOpen(false)}
            >
              <form
                className="paste-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const m: InboxMessage = {
                    id: crypto.randomUUID(),
                    from:
                      extractLocally(messageText.trim(), state.orders)
                        .customer || "Pasted message",
                    body: messageText.trim(),
                    receivedAt: new Date().toISOString(),
                    source: "pasted",
                  };
                  if (!m.body) return;
                  const next = [m, ...pasted];
                  try {
                    localStorage.setItem(
                      "harvest-pasted-messages",
                      JSON.stringify(next),
                    );
                  } catch {
                    setPasteError(
                      "This device could not save the message. Free some browser storage and try again.",
                    );
                    return;
                  }
                  setPasted(next);
                  props.onPastedMessages(next);
                  setSelectedId(m.id);
                  setMessageText("");
                  setPasteError("");
                  setPasteOpen(false);
                  setFilter("all");
                  setQuery("");
                  setMobileMessageOpen(true);
                }}
              >
                <label className="compose-label" htmlFor="new-message">
                  Original message
                </label>
                <textarea
                  autoFocus
                  id="new-message"
                  aria-label="Message to review"
                  required
                  maxLength={4000}
                  rows={6}
                  placeholder="Paste the original message, including the customer name…"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
                {pasteError && (
                  <p className="form-error" role="alert">
                    {pasteError}
                  </p>
                )}
                <div className="paste-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPasteOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="button primary">
                    Open for review
                    <ArrowRight size={15} />
                  </button>
                </div>
              </form>
            </MessageDialog>
          )}
          <div
            className={`inbox-layout ${mobileMessageOpen && selected ? "has-open-message" : ""}`}
          >
            <aside className="message-list" aria-label="Received messages">
              <div className="message-list-tools">
                <div className="message-list-heading">
                  <h2>
                    Inbox <span>{messages.length}</span>
                  </h2>
                  <select
                    aria-label="Filter messages"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                  >
                    <option value="all">All messages</option>
                    <option value="pending">Needs review</option>
                    <option value="trash">Trash</option>
                  </select>
                </div>
                <label className="inbox-search">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Search messages"
                    placeholder="Search messages"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              </div>
              <div className="message-list-label">
                <span>
                  {filter === "trash"
                    ? "Deleted messages"
                    : filter === "pending"
                      ? "Waiting for review"
                      : "Recent messages"}
                </span>
                <span>{filter === "trash" ? `${trash.length} deleted` : `${pending.length} to review`}</span>
              </div>
              <div
                className="message-items"
                tabIndex={0}
                aria-label="Scrollable message list"
              >
                {visibleMessages.map((m) => {
                  const reviewed = state.reviewedMessages?.includes(m.id);
                  const details = extractLocally(m.body, state.orders);
                  const preview = m.body.startsWith(`${m.from}:`)
                    ? m.body.slice(m.from.length + 1).trim()
                    : m.body;
                  return (
                    <div className="message-row" key={m.id}>
                      <button
                        className={`message-item ${selected?.id === m.id ? "selected" : ""}`}
                        aria-pressed={selected?.id === m.id}
                        onClick={() => {
                          setSelectedId(m.id);
                          setMobileMessageOpen(true);
                        }}
                      >
                        <MessageAvatar message={m} />
                        <span className="message-item-content">
                          <span className="message-item-top">
                            <strong>{m.from}</strong>
                            <time dateTime={m.receivedAt}>
                              {clockTime(m.receivedAt)}
                            </time>
                          </span>
                          <span className="message-item-subject">
                            {details.intent === "amend"
                              ? "Order update"
                              : details.intent === "cancel"
                                ? "Cancellation request"
                                : "Customer order"}
                          </span>
                          <span className="message-preview">{preview}</span>
                          <span className="message-item-footer">
                            <span
                              className={`message-item-status ${reviewed ? "is-reviewed" : ""}`}
                            >
                              {reviewed ? (
                                <CheckCheck size={12} />
                              ) : (
                                <span className="review-dot" />
                              )}
                              {reviewed ? "Reviewed" : "Needs review"}
                            </span>
                            {details.boxes !== null && (
                              <span className="message-quantity">
                                {details.boxes} boxes
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        className="message-delete"
                        aria-label={`${filter === "trash" ? "Restore" : "Delete"} message from ${m.from} at ${clockTime(m.receivedAt)}`}
                        title={
                          filter === "trash"
                            ? "Restore message"
                            : "Move to Trash"
                        }
                        onClick={() => {
                          props.onDeleteMessage(m.id, filter !== "trash");
                          setLastDeleted(filter === "trash" ? null : m.id);
                          setMobileMessageOpen(false);
                        }}
                      >
                        {filter === "trash" ? (
                          <Refresh size={15} />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  );
                })}
                {visibleMessages.length === 0 && (
                  <div className="inbox-empty">
                    {query.trim() ? (
                      <Search size={24} />
                    ) : (
                      <CheckCheck size={24} />
                    )}
                    <strong>
                      {query.trim()
                        ? "No messages found"
                        : filter === "trash"
                          ? "Trash is empty"
                          : "All caught up"}
                    </strong>
                    <p>
                      {query.trim()
                        ? "Try a customer name or a word from the message."
                        : filter === "trash"
                          ? "Deleted messages can be restored here."
                          : "No messages waiting here."}
                    </p>
                  </div>
                )}
              </div>
              <div className="inbox-footnote">
                {lastDeleted ? (
                  <>
                    <span>Moved to Trash</span>
                    <button
                      className="text-button"
                      onClick={() => {
                        props.onDeleteMessage(lastDeleted, false);
                        setSelectedId(lastDeleted);
                        setLastDeleted(null);
                      }}
                    >
                      Undo
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      {filter === "trash" ? trash.length : messages.length}{" "}
                      {(filter === "trash" ? trash.length : messages.length) === 1 ? "message" : "messages"}
                    </span>
                    <span>{filter === "trash" ? "Restore anytime" : `${pending.length} to review`}</span>
                  </>
                )}
              </div>
            </aside>
            {selected && filter === "trash" ? (
              <div className="inbox-placeholder">
                <Trash2 size={32} />
                <h2>Message in Trash</h2>
                <p>Restore this message to review its order details.</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    props.onDeleteMessage(selected.id, false);
                    setFilter("all");
                    setLastDeleted(null);
                  }}
                >
                  Restore message
                </button>
              </div>
            ) : selected ? (
              <OrderReview
                key={`${selected.id}-${state.reviewedMessages?.includes(selected.id)}`}
                message={selected}
                state={state}
                aiReady={!!status?.aiReady}
                onReview={props.onReview}
                onBack={() => setMobileMessageOpen(false)}
              />
            ) : (
              <div className="inbox-placeholder">
                <MessageSquare size={36} />
                <h2>
                  {query.trim()
                    ? "No matching messages"
                    : "You're all caught up"}
                </h2>
                <p>
                  {query.trim()
                    ? "Change your search to find a customer message."
                    : "New customer messages will appear in your inbox."}
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <FarmerSms key={props.revision} {...props} />
      )}
    </>
  );
}

function OrderReview({
  message,
  state,
  aiReady,
  onReview,
  onBack,
}: {
  message: InboxMessage;
  state: FarmState;
  aiReady: boolean;
  onReview: Props["onReview"];
  onBack: () => void;
}) {
  const initial = useMemo(
    () => extractLocally(message.body, state.orders),
    [message.body, state.orders],
  );
  const [extracted, setExtracted] = useState<ExtractedOrder>(initial);
  const [customer, setCustomer] = useState(initial.customer || "");
  const [boxes, setBoxes] = useState(
    initial.boxes === null ? "" : String(initial.boxes),
  );
  const match = state.orders.find(
    (o) => o.customer.toLowerCase() === (initial.customer || "").toLowerCase(),
  );
  const [orderId, setOrderId] = useState(match?.id || "");
  const [action, setAction] = useState<"new" | "replace" | "cancel" | "ignore">(
    initial.intent === "cancel" && match ? "cancel" : match ? "replace" : "new",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewed = state.reviewedMessages?.includes(message.id);
  const target = state.orders.find((o) => o.id === orderId);
  const quantity = Number(boxes);
  const valid =
    !busy &&
    confirmed &&
    (action === "ignore" ||
      ((action === "cancel" ||
        (customer.trim().length > 0 &&
          boxes !== "" &&
          Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= 10000)) &&
        (action === "new" || !!target)));
  const currentDemand = makePlan(state).demand;
  const delta =
    action === "ignore"
      ? 0
      : action === "cancel"
        ? -(target?.boxes || 0)
        : (Number.isFinite(quantity) ? quantity : 0) -
          (action === "replace" ? target?.boxes || 0 : 0);
  return (
    <section className="review-panel" aria-label="Order review">
      <div className="review-heading">
        <button
          type="button"
          className="inbox-back"
          onClick={onBack}
          aria-label="Back to inbox"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="review-sender">
          <MessageAvatar message={message} />
          <div>
            <h2>{initial.customer || message.from}</h2>
            <p>
              {message.source === "sample"
                ? "Sample message"
                : message.source === "sms"
                  ? "Text message"
                  : "Pasted message"}
              <span>·</span>
              <time dateTime={message.receivedAt}>
                {new Date(message.receivedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
                , {clockTime(message.receivedAt)}
              </time>
            </p>
          </div>
        </div>
        <span className={`review-pill ${reviewed ? "complete" : ""}`}>
          {reviewed ? (
            <CheckCheck size={14} />
          ) : (
            <span className="review-dot" />
          )}
          {reviewed ? "Reviewed" : "Needs review"}
        </span>
      </div>
      <div className="review-correspondence">
        <div className="conversation-date">
          <span>
            {new Date(message.receivedAt).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <div className="source-document" aria-label="Original message">
          <div className="source-caption">
            <MessageSquare size={14} />
            <span>Customer message</span>
            <time dateTime={message.receivedAt}>
              {clockTime(message.receivedAt)}
            </time>
          </div>
          <blockquote>{message.body}</blockquote>
          <div className="source-original-label">
            Original text ·{" "}
            {message.source === "sample"
              ? "sample message"
              : message.source === "sms"
                ? "received by SMS"
                : "pasted message"}
          </div>
        </div>
        {match && (
          <div className="conversation-order">
            <ClipboardList size={18} />
            <div>
              <span>Order on file</span>
              <strong>{match.customer}</strong>
            </div>
            <strong>
              {match.boxes}
              <small> boxes</small>
            </strong>
          </div>
        )}
        <div className="conversation-note">
          <ClipboardList size={15} />
          <p>
            {reviewed
              ? "This message has been reviewed. Its original text is saved."
              : "Review the order details before applying this message."}
          </p>
        </div>
      </div>
      {reviewed ? (
        <div className="review-complete">
          <CheckCheck size={24} />
          <h3>This source has been reviewed.</h3>
          <p>
            It won’t be applied a second time. Any order created from it keeps a
            copy of the original message.
          </p>
        </div>
      ) : (
        <form
          className="order-review-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onReview(message, action, {
              id: action === "new" ? crypto.randomUUID() : orderId,
              customer: customer.trim(),
              boxes: quantity || 0,
              source: "Text message",
              time: clockTime(message.receivedAt),
              provenance: {
                messageId: message.id,
                body: message.body,
                from: message.from,
                receivedAt: message.receivedAt,
                reviewedAt: new Date().toISOString(),
                extraction: extracted.method,
                evidence: extracted.evidence,
              },
            });
          }}
        >
          <div className="extraction-heading">
            <div>
              <h3>Order details</h3>
              <span
                title={
                  extracted.evidence
                    ? `${extracted.evidence.model} · ${extracted.evidence.responseId}`
                    : undefined
                }
              >
                {extracted.method === "ai"
                  ? "Extracted with OpenAI. Review before saving."
                  : "Local parser. Review before saving."}
              </span>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              title={
                !aiReady
                  ? "Read the message again with the local parser."
                  : "Send this message and known customer names to OpenAI for extraction."
              }
              onClick={async () => {
                setBusy(true);
                setConfirmed(false);
                setError("");
                try {
                  const result = !aiReady
                    ? extractLocally(message.body, state.orders)
                    : await api<ExtractedOrder>("/api/orders/extract", {
                        body: message.body,
                        orders: state.orders.map(({ id, customer, boxes }) => ({
                          id,
                          customer,
                          boxes,
                        })),
                        useAI: true,
                      });
                  setExtracted(result);
                  setCustomer(result.customer || "");
                  setBoxes(result.boxes === null ? "" : String(result.boxes));
                  const found = state.orders.find(
                    (o) =>
                      o.customer.toLowerCase() ===
                      result.customer?.toLowerCase(),
                  );
                  setOrderId(found?.id || "");
                  setAction(
                    result.intent === "cancel" && found
                      ? "cancel"
                      : found
                        ? "replace"
                        : "new",
                  );
                  setConfirmed(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Reading…" : aiReady ? "Extract with AI" : "Read again"}
              <Refresh size={13} />
            </button>
          </div>
          <div className="order-change-summary">
            <div>
              <span>
                {action === "ignore"
                  ? "No order change"
                  : action === "cancel"
                    ? "Proposed cancellation"
                    : action === "replace"
                      ? "Proposed update"
                      : "New order"}
              </span>
              <strong>
                {action === "ignore"
                  ? "Keep the current orders"
                  : "Tomato boxes"}
              </strong>
            </div>
            <div className="change-quantities">
              {(action === "replace" || action === "cancel") && target && (
                <>
                  <span>{target.boxes}</span>
                  <ArrowRight size={16} />
                </>
              )}
              <strong>
                {action === "ignore"
                  ? "—"
                  : action === "cancel"
                    ? 0
                    : boxes || "—"}
              </strong>
            </div>
          </div>
          <div className="review-field-group">
            <div className="review-fields">
              <label className="form-field">
                Customer
                <input
                  required={action !== "ignore"}
                  maxLength={80}
                  value={customer}
                  onChange={(e) => {
                    setCustomer(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="form-field">
                Tomato boxes
                <input
                  type="number"
                  min={action === "cancel" ? 0 : 1}
                  max={10000}
                  step={1}
                  disabled={action === "cancel" || action === "ignore"}
                  value={boxes}
                  onChange={(e) => {
                    setBoxes(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
            </div>
            <div className="source-facts">
              <span>
                Crop<strong>{extracted.crop || "Not stated"}</strong>
              </span>
              <span>
                Delivery
                <strong>{extracted.delivery || "Not stated"}</strong>
              </span>
            </div>
            <div className="review-action-fields">
              <label className="form-field">
                Action
                <select
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value as typeof action);
                    setConfirmed(false);
                  }}
                >
                  <option value="new">Add a new order</option>
                  <option value="replace">Replace an existing order</option>
                  <option value="cancel">Cancel an existing order</option>
                  <option value="ignore">Keep orders unchanged</option>
                </select>
              </label>
              {(action === "replace" || action === "cancel") && (
                <label className="form-field">
                  Existing order
                  <select
                    required
                    value={orderId}
                    onChange={(e) => {
                      setOrderId(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Choose the order…</option>
                    {state.orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.customer} · {o.boxes} boxes
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
          {extracted.warnings.filter(
            (w) => !w.startsWith("There is already an order"),
          ).length > 0 && (
            <div className="review-warnings">
              {extracted.warnings
                .filter((w) => !w.startsWith("There is already an order"))
                .map((w) => (
                  <p key={w}>{w}</p>
                ))}
            </div>
          )}
          <div className="review-bottom">
            <div className="review-impact">
              <span>Demand after review</span>
              <strong>
                <span>{currentDemand}</span>
                <ArrowRight size={14} />
                {Math.max(0, currentDemand + delta)} <small>boxes</small>
              </strong>
            </div>
            <label className="review-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                {action === "ignore"
                  ? "I’ve checked this message and it does not need an order change."
                  : "I’ve checked the customer, box size, quantity, and September 19 delivery."}
              </span>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full-width" disabled={!valid}>
              {action === "ignore"
                ? "Mark reviewed"
                : action === "cancel"
                  ? "Confirm cancellation"
                  : action === "replace"
                    ? "Confirm replacement"
                    : "Confirm and add order"}
              <Check size={16} />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function FarmerSms({
  state,
  workspace,
  revision,
  status,
  connectionError,
  onRefresh,
  onEditRequest,
}: Props) {
  const [mode, setMode] = useState<"demo" | "live">(
    status?.farmer ? "live" : "demo",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retry, setRetry] = useState(false);
  const [checkedDelivery, setCheckedDelivery] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const p = status?.proposals.find(
    (p) => p.mode === mode && p.revision === revision,
  );
  const current = !retry && p && p.phase !== "superseded" ? p : undefined;
  const text = current?.body || smsBody(state, "ABC123");
  const [confirmed, setConfirmed] = useState(false);
  async function sendProposal() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await api<SmsProposal>("/api/sms/proposals", {
        workspace,
        revision,
        requestKey,
        mode,
        state,
      });
      setReply(`APPROVE ${result.code}`);
      await onRefresh();
      setRetry(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sms-layout">
      <section className="sms-workflow">
        <div className="sms-intro">
          <span className="eyebrow">DAILY COMMITMENT</span>
          <h2>Send the morning plan.</h2>
          <p>
            Review the message, choose a phone, and send. The farmer’s reply
            comes straight back to this plan.
          </p>
        </div>
        <div className="sms-mode" role="group" aria-label="SMS mode">
          <button
            aria-pressed={mode === "demo"}
            onClick={() => {
              setMode("demo");
              setConfirmed(false);
              setRequestKey(crypto.randomUUID());
              setFeedback("");
            }}
          >
            Demo phone
          </button>
          <button
            aria-pressed={mode === "live"}
            onClick={() => {
              setMode("live");
              setConfirmed(false);
              setRequestKey(crypto.randomUUID());
              setFeedback("");
            }}
          >
            Live SMS
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="sms-recipient">
          <span className="recipient-avatar">
            <img
              src={phoneAppIcon}
              alt=""
              width={34}
              height={34}
              draggable={false}
            />
          </span>
          <div>
            <strong>
              {mode === "demo"
                ? "Farmer’s demo phone"
                : status?.farmer || "Farmer number not configured"}
            </strong>
            <span>
              {mode === "demo"
                ? "Practice the full flow. No texts are sent."
                : `Via Twilio · ${status?.sender || "sender not configured"}`}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="SMS connection settings"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings2 size={18} />
          </button>
        </div>
        {mode === "live" && !status?.ready && (
          <div className="form-warning">
            {status?.optedOut
              ? "This recipient opted out. They must text START to your Twilio number to receive plans again."
              : status?.campaignStatus && status.campaignStatus !== "VERIFIED"
                ? status.campaignMessage
                : "Finish the Twilio connection below to send to a real phone."}
          </div>
        )}
        {current ? (
          <div className="sms-progress">
            <div>
              <span
                className={`progress-check ${current.phase === "approved" ? "approved" : ""}`}
              >
                <Check size={16} />
              </span>
              <div>
                <strong>
                  {current.mode === "demo"
                    ? "Demo plan created"
                    : `SMS ${current.delivery}`}
                </strong>
                <p>
                  Plan {current.code} · {clockTime(current.createdAt)}
                </p>
              </div>
            </div>
            <div>
              <span
                className={`progress-check ${current.phase === "approved" ? "approved" : "waiting"}`}
              >
                {current.phase === "approved" ? (
                  <CheckCheck size={16} />
                ) : (
                  <MessageSquare size={16} />
                )}
              </span>
              <div>
                <strong>
                  {current.phase === "approved"
                    ? "Farmer approved"
                    : current.phase === "changes_requested"
                      ? "Farmer requested a change"
                      : "Waiting for the farmer"}
                </strong>
                <p>
                  {current.reply ||
                    "Approval needs a reply with this plan’s code."}
                </p>
              </div>
            </div>
            {current.error && (
              <p className="form-error" role="alert">
                {current.error}
              </p>
            )}
            {["failed", "unknown", "undelivered"].includes(
              current.delivery,
            ) && (
              <div className="retry-sms">
                <label className="review-check">
                  <input
                    type="checkbox"
                    checked={checkedDelivery}
                    onChange={(e) => setCheckedDelivery(e.target.checked)}
                  />
                  <span>
                    I checked Twilio’s log and this plan was not delivered.
                  </span>
                </label>
                <button
                  className="button secondary"
                  disabled={!checkedDelivery}
                  onClick={() => {
                    setRequestKey(crypto.randomUUID());
                    setConfirmed(false);
                    setRetry(true);
                    setCheckedDelivery(false);
                  }}
                >
                  Prepare another SMS
                </button>
              </div>
            )}
            {current.phase === "changes_requested" && (
              <button
                className="button secondary"
                onClick={() => onEditRequest(current.requestedTarget!)}
              >
                Apply {current.requestedTarget}-box request
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        ) : (
          <>
            {mode === "live" && (
              <label className="review-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  Send this sample plan to the configured farmer, who has agreed
                  to receive it.
                </span>
              </label>
            )}
            <button
              className="button primary full-width"
              disabled={
                busy ||
                !status ||
                (mode === "live" && (!status.ready || !confirmed))
              }
              onClick={sendProposal}
            >
              {busy
                ? "Preparing…"
                : mode === "demo"
                  ? "Send to demo phone"
                  : "Send SMS to farmer"}
              <ArrowRight size={16} />
            </button>
          </>
        )}
        {(error || connectionError) && (
          <p className="form-error" role="alert">
            {error || connectionError}
          </p>
        )}
        <div className="sms-reply-guide">
          <h3>Two ways to reply</h3>
          <div>
            <code>APPROVE {current?.code || "ABC123"}</code>
            <span>Confirm this commitment</span>
          </div>
          <div>
            <code>EDIT {current?.code || "ABC123"} 100</code>
            <span>Request a different quantity</span>
          </div>
          <p>A changed plan always needs a new approval.</p>
        </div>
        <button
          className="text-button"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings2 size={15} />
          {settingsOpen
            ? "Hide connection details"
            : "Twilio connection details"}
          <ChevronRight size={14} />
        </button>
        {settingsOpen && (
          <MessageDialog
            title="SMS connection"
            description="Connect Twilio to this workspace."
            onClose={() => setSettingsOpen(false)}
          >
            <div className="connection-details">
              {status?.campaignMessage && <p>{status.campaignMessage}</p>}
              <h3>Connect your Twilio number</h3>
              <p>
                Add your credentials and farmer number to the project’s{" "}
                <code>.env</code> file, then restart the server. Keys stay on
                the server.
              </p>
              {!!status?.missing.length && (
                <ul>
                  {status.missing.map((key) => (
                    <li key={key}>
                      <code>{key}</code>
                    </li>
                  ))}
                </ul>
              )}
              <p>In Twilio, set “A message comes in” to POST:</p>
              <code className="endpoint">
                {status?.publicUrl || "https://your-public-host"}
                /webhooks/twilio/inbound
              </code>
              <p>
                Delivery callbacks are included automatically when a plan is
                sent.
              </p>
              <label className="form-field">
                Remote workspace access token
                <input
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Only needed when opening a public URL"
                />
              </label>
              <button
                className="button secondary"
                onClick={async () => {
                  if (accessToken) {
                    sessionStorage.setItem("harvest-access-token", accessToken);
                    setAccessToken("");
                  }
                  await onRefresh();
                }}
              >
                Refresh connection
              </button>
            </div>
          </MessageDialog>
        )}
      </section>
      <div className="phone-preview-column">
        <div className="phone-preview-label">
          <span>FARMER’S PHONE</span>
          <span>{mode === "demo" ? "Interactive preview" : "Live SMS"}</span>
        </div>
        <div className="sms-phone">
          <div className="phone-wallpaper" aria-hidden="true" />
          <div className="phone-island" aria-hidden="true">
            <span />
          </div>
          <div className="phone-status">
            <span>6:00</span>
            <div>
              <CellularNetwork size={16} />
              <BatteryFull size={20} />
            </div>
          </div>
          <div className="lock-clock">
            <h2>6:00</h2>
            <p>Saturday, September 19</p>
          </div>
          <div className="phone-conversation">
            <div className="lock-notification">
              <div className="notification-heading">
                <img src="/favicon.svg" alt="" />
                <span>Harvest Commit</span>
                <time>{current ? "now" : "preview"}</time>
              </div>
              <strong className="notification-title">
                {text.split("\n")[1].replace(/^Plan [A-F0-9]+: /, "Harvest ")}
              </strong>
              <p className="notification-summary">
                {text.split("\n").slice(2, 5).join("\n")}
              </p>
              <details className="notification-details">
                <summary>
                  Read full message
                  <ChevronRight size={13} />
                </summary>
                <div className="sms-bubble">{text}</div>
              </details>
            </div>
            {current?.reply && (
              <div className="lock-notification notification-response">
                <div className="notification-heading">
                  <CheckCheck size={16} />
                  <span>
                    {current.phase === "approved"
                      ? "Approved"
                      : "Change requested"}
                  </span>
                  <time>now</time>
                </div>
                <p>{current.reply}</p>
              </div>
            )}
            {feedback && (
              <div
                className="lock-notification notification-response"
                role="status"
              >
                <p>{feedback}</p>
              </div>
            )}
            <span className="bubble-status">
              {current
                ? mode === "demo"
                  ? "Simulated notification"
                  : current.delivery
                : "Preview · not sent"}
            </span>
          </div>
          {mode === "demo" && current?.phase === "pending" && (
            <form
              className="phone-reply"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const response = await api<{ reply: string }>(
                    "/api/sms/demo-reply",
                    { workspace, body: reply },
                  );
                  setFeedback(response.reply);
                  await onRefresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="sr-only" htmlFor="farmer-reply">
                Farmer reply
              </label>
              <input
                id="farmer-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={160}
                placeholder={`APPROVE ${current.code}`}
              />
              <button
                disabled={busy || !reply.trim()}
                aria-label="Send demo reply"
              >
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <div className="phone-home-indicator" />
        </div>
        <p className="phone-caption">
          {mode === "demo"
            ? "Try APPROVE plus the code, or EDIT plus the code and a quantity. This uses the same approval rules as live SMS."
            : "This is a plain text message. The farmer replies from their usual messaging app."}
        </p>
        <button
          className="text-button copy-sms"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setFeedback("Message copied.");
            } catch {
              setError("Clipboard is unavailable on this browser.");
            }
          }}
        >
          <Copy size={14} />
          Copy message text
        </button>
      </div>
    </div>
  );
}
