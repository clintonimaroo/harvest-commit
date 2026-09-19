import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import clintonAvatar from "./assets/clinton-avatar.png";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CloudRain,
  Copy,
  FileSpreadsheet,
  History,
  Leaf,
  Menu,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  Sunrise,
  Tractor,
  Trash2,
  Users,
  WifiOff,
  X,
  Crop,
  FieldPlant,
} from "./icons";
import type { FarmState, Field, Order, Source } from "./lib/planning";
import {
  crewSheet,
  formatHour,
  makePlan,
  parseOrderMessage,
  readSavedState,
  seed,
} from "./lib/planning";

import { MessagesPage } from "./components/MessagesPage";
import { WeatherCard } from "./components/WeatherCard";
import { Sidebar } from "./components/Sidebar";
import type { Page } from "./components/Sidebar";
import { api } from "./lib/api";
import type { InboxMessage } from "./lib/messages";
import { useMessaging } from "./lib/useMessaging";
import { useFarmSync } from "./lib/useFarmSync";
import type { FarmSnapshot } from "./lib/farm-sync";

type Modal =
  | "order"
  | "inputs"
  | "edit"
  | "approve"
  | "sheet"
  | "explain"
  | "record"
  | "reset"
  | null;
const STORAGE_KEY = "harvest-commit-v1";
const sources: Source[] = [
  "Text message",
  "Spreadsheet",
  "Phone call",
  "Manual entry",
];
const sourceIcons = {
  "Text message": MessageSquare,
  Spreadsheet: FileSpreadsheet,
  "Phone call": Phone,
  "Manual entry": Pencil,
};
function FieldDrawing({
  field = "B",
  large = false,
}: {
  field?: string;
  large?: boolean;
}) {
  return (
    <div
      className={`field-drawing field-${field.toLowerCase()} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <span className="field-plant">
        <FieldPlant size={large ? 48 : 26} />
      </span>
      {large && (
        <div className="field-drawing-label">
          <span>Tomato growing area</span>
          <strong>Field {field}</strong>
        </div>
      )}
    </div>
  );
}

function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-header">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function App({
  cloud,
  onSignOut,
}: {
  cloud?: FarmSnapshot;
  onSignOut?: () => Promise<void>;
}) {
  const [state, setState] = useState<FarmState>(() => {
    if (cloud) return cloud.state;
    try {
      const saved = readSavedState(localStorage.getItem(STORAGE_KEY));
      return { ...saved, revision: saved.revision || crypto.randomUUID() };
    } catch {
      return { ...structuredClone(seed), revision: crypto.randomUUID() };
    }
  });
  const [workspace] = useState(() => {
    if (cloud) return cloud.workspace;
    try {
      const stored = localStorage.getItem("harvest-workspace");
      if (stored) return stored;
      const id = crypto.randomUUID();
      localStorage.setItem("harvest-workspace", id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });
  const { messaging, connectionError, refreshMessaging } =
    useMessaging(workspace);
  const saveStatus = useFarmSync(state, cloud);
  const [messageTab, setMessageTab] = useState<"inbox" | "phone">("inbox");
  const [page, setPage] = useState<Page>("Today");
  const [modal, setModal] = useState<Modal>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editField, setEditField] = useState<Field | null>(null);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [storageFailed, setStorageFailed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("harvest-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        "harvest-sidebar-collapsed",
        String(sidebarCollapsed),
      );
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }, [sidebarCollapsed]);
  const [search, setSearch] = useState("");
  const [orderSource, setOrderSource] = useState("All sources");
  const plan = makePlan(state);
  const workingFields = plan.allocations.filter((field) => field.boxes > 0);
  const approved = !!state.approvedAt;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [state]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    document.title = `Harvest Commit · ${page === "Today" ? "Today's harvest" : page}`;
  }, [page]);

  useEffect(() => {
    if (online)
      void api("/api/sms/invalidate", { workspace, revision: state.revision })
        .then(refreshMessaging)
        .catch(() => {});
  }, [workspace, state.revision, online, refreshMessaging]);
  useEffect(() => {
    const reply = messaging?.proposals.find(
      (p) => p.revision === state.revision && p.phase === "approved",
    );
    if (!reply || state.approvedAt) return;
    setState((s) => {
      if (s.revision !== reply.revision || s.approvedAt) return s;
      const current = makePlan(s);
      return {
        ...s,
        approvedAt: reply.approvedAt!,
        approvedVia:
          reply.mode === "demo" ? "Demo SMS approval" : "Farmer SMS approval",
        records: [
          {
            id: "today",
            date: "2026-09-19",
            planned: current.target,
            actual: null,
            demand: current.demand,
            packed: s.packed,
            note: `${reply.mode === "demo" ? "Demo" : "Farmer"} SMS approval · plan ${reply.code}`,
          },
          ...s.records.filter((r) => r.id !== "today"),
        ],
      };
    });
    setToast(
      reply.mode === "demo"
        ? "Demo reply received. Plan approved."
        : "Farmer approved this plan by SMS.",
    );
  }, [messaging, state.revision, state.approvedAt]);
  const navigate = (next: Page) => {
    setPage(next);
    setMobileNav(false);
  };
  const close = () => {
    setModal(null);
    setEditField(null);
    setEditOrder(null);
  };
  const updateInputs = (patch: Partial<FarmState>, message: string) => {
    setState((s) => ({
      ...s,
      ...patch,
      approvedAt: null,
      approvedVia: undefined,
      revision: crypto.randomUUID(),
      records: s.records.flatMap((r) =>
        r.id !== "today"
          ? [r]
          : r.actual !== null
            ? [{ ...r, id: `earlier-${crypto.randomUUID()}` }]
            : [],
      ),
      target: "target" in patch ? patch.target! : null,
    }));
    setToast(
      approved ? `${message} Review and approve the updated plan.` : message,
    );
    close();
  };
  const approvePlan = () => {
    setState((s) => ({
      ...s,
      approvedAt: new Date().toISOString(),
      approvedVia: "Approved in the app",
      records: [
        {
          id: "today",
          date: "2026-09-19",
          planned: plan.target,
          actual: null,
          demand: plan.demand,
          packed: s.packed,
          note: s.planNote || "Approved morning commitment.",
        },
        ...s.records.filter((r) => r.id !== "today"),
      ],
    }));
    close();
    setToast("Plan approved. Your crew sheet is ready.");
  };
  const download = (filename: string, content: string, type = "text/plain") => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Download ready.");
  };
  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(crewSheet(state));
      setToast("Crew sheet copied. Ready to paste into a message.");
    } catch {
      setToast("Clipboard unavailable. Use Download to save the crew sheet.");
    }
  };
  const openOrder = (order: Order | null = null) => {
    setEditOrder(order);
    setModal("order");
  };
  const reviewMessage = (
    message: InboxMessage,
    action: "new" | "replace" | "cancel" | "ignore",
    order: Order,
  ) => {
    setState((s) => {
      if (s.reviewedMessages?.includes(message.id)) return s;
      const reviewedMessages = [...(s.reviewedMessages || []), message.id];
      if (action === "ignore") return { ...s, reviewedMessages };
      const orders =
        action === "new"
          ? [...s.orders, order]
          : action === "replace"
            ? s.orders.map((o) => (o.id === order.id ? order : o))
            : s.orders.filter((o) => o.id !== order.id);
      return {
        ...s,
        orders,
        reviewedMessages,
        revision: crypto.randomUUID(),
        approvedAt: null,
        approvedVia: undefined,
        target: null,
        records: s.records.flatMap((r) =>
          r.id !== "today"
            ? [r]
            : r.actual !== null
              ? [{ ...r, id: `earlier-${crypto.randomUUID()}` }]
              : [],
        ),
      };
    });
    setToast(
      action === "ignore"
        ? "Message reviewed. Orders unchanged."
        : "Source reviewed. Orders updated and plan recalculated.",
    );
  };
  const filteredOrders = state.orders.filter(
    (o) =>
      o.customer.toLowerCase().includes(search.toLowerCase()) &&
      (orderSource === "All sources" || o.source === orderSource),
  );

  return (
    <div className={`app-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar
        page={page}
        orderCount={state.orders.length}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileNav}
        onNavigate={navigate}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onCloseMobile={() => setMobileNav(false)}
        onAction={setModal}
        onSignOut={onSignOut}
        onBackup={() =>
          download(
            "Harvest Commit Workspace.json",
            JSON.stringify(
              {
                workspace,
                state,
                pasted: JSON.parse(
                  localStorage.getItem("harvest-pasted-messages") || "[]",
                ),
              },
              null,
              2,
            ),
            "application/json",
          )
        }
      />

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Pine Hollow Farm</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className={`save-status ${storageFailed ? "warning" : ""}`}>
              {!online ? (
                <WifiOff size={14} />
              ) : (
                <span className="status-dot" />
              )}
              {storageFailed
                ? "Storage unavailable"
                : !online
                  ? "Offline · saved on device"
                  : saveStatus}
            </span>
            <span className="topbar-divider" />
            <span className="topbar-avatar">
              <img
                src={clintonAvatar}
                alt="Clinton Imaro"
                width={28}
                height={28}
                draggable={false}
              />
            </span>
          </div>
        </header>

        <main>
          {page === "Messages" && (
            <MessagesPage
              state={state}
              workspace={workspace}
              revision={state.revision!}
              status={messaging}
              connectionError={connectionError}
              tab={messageTab}
              onTab={setMessageTab}
              onRefresh={refreshMessaging}
              onReview={reviewMessage}
              onPastedMessages={(messages) =>
                setState((s) => ({ ...s, pastedMessages: messages }))
              }
              onDeleteMessage={(id, deleted) =>
                setState((s) => ({
                  ...s,
                  deletedMessages: deleted
                    ? [...new Set([...(s.deletedMessages || []), id])]
                    : (s.deletedMessages || []).filter((value) => value !== id),
                }))
              }
              onEditRequest={(target) =>
                updateInputs(
                  { target },
                  "Farmer’s requested quantity applied. Send the revised plan for fresh approval.",
                )
              }
            />
          )}
          {page === "Today" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow date-label">
                    SATURDAY, SEPTEMBER 19 <span>2026</span>
                  </div>
                  <h1>
                    Today's harvest<span className="heading-period">.</span>
                  </h1>
                  <p>The orders are in. Let’s make a plan for the field.</p>
                </div>
                <button
                  className="button secondary heading-action"
                  onClick={() => setModal("inputs")}
                >
                  <Settings2 size={16} />
                  Update inputs
                </button>
              </div>

              <div className="morning-strip">
                <span>
                  <Sunrise size={19} />
                  <strong>The morning picture</strong>
                </span>
                <div>
                  <span>
                    <ClipboardList size={15} />
                    {state.orders.length} orders received
                  </span>
                  <i />
                  <span>
                    <Users size={15} />
                    {state.crew} people available
                  </span>
                  <i />
                  <span>
                    <Leaf size={15} />
                    {state.fields.length} fields checked
                  </span>
                </div>
                <button
                  onClick={() => setModal("explain")}
                  aria-label="View planning inputs"
                >
                  <ArrowUpRight size={18} />
                </button>
              </div>

              <div className="today-grid">
                <div className="primary-column">
                  <section
                    className={`commitment-card ${approved ? "is-approved" : ""}`}
                  >
                    <div className="card-top">
                      <span className="eyebrow">Daily commitment</span>
                      <span className={`badge ${approved ? "green" : "amber"}`}>
                        <span />
                        {approved
                          ? state.approvedVia === "Demo SMS approval"
                            ? "Approved in demo"
                            : "Approved"
                          : "Ready for review"}
                      </span>
                    </div>
                    <div className="commitment-title">
                      <h2>
                        {plan.target === 0 ? (
                          "No picking needed."
                        ) : (
                          <>
                            Harvest <span>{plan.target}</span> boxes.
                          </>
                        )}
                        <br />
                        <span className="muted-title">
                          {plan.shortfall
                            ? `${plan.shortfall} boxes still needed.`
                            : plan.target === 0
                              ? "Use your packed stock."
                              : `Start with ${workingFields[0]?.name || "Field B"}.`}
                        </span>
                      </h2>
                      <span className="crop-stamp">
                        <Crop size={20} />
                        <span>Tomatoes</span>
                      </span>
                    </div>
                    <div className="plan-equation">
                      <div>
                        <span>Customer orders</span>
                        <strong>
                          {plan.demand}
                          <small>boxes</small>
                        </strong>
                      </div>
                      <span className="operator">−</span>
                      <div>
                        <span>Already packed</span>
                        <strong>
                          {state.packed}
                          <small>boxes</small>
                        </strong>
                      </div>
                      <span className="operator">=</span>
                      <div className="result">
                        <span>Harvest needed</span>
                        <strong>
                          {plan.needed}
                          <small>boxes</small>
                        </strong>
                      </div>
                    </div>
                    <div
                      className={`plan-note ${plan.shortfall || plan.conservativeShortfall ? "risk" : ""}`}
                    >
                      <span className="note-icon">
                        {plan.shortfall ? (
                          <CloudRain size={18} />
                        ) : (
                          <Check size={18} />
                        )}
                      </span>
                      <p>
                        {plan.shortfall ? (
                          <>
                            <strong>
                              {plan.shortfall} boxes still need a decision.
                            </strong>{" "}
                            This plan does not cover all current orders. Review
                            customer commitments.
                          </>
                        ) : plan.surplus ? (
                          <>
                            <strong>
                              {plan.surplus} boxes above current orders.
                            </strong>{" "}
                            Check that you have a use for the extra stock.
                          </>
                        ) : (
                          <>
                            <strong>Orders covered at expected yield.</strong>{" "}
                            {plan.conservativeShortfall
                              ? `${plan.conservativeShortfall} boxes short at the low field estimate. Review the risk before committing.`
                              : "Current orders are also covered at the low field estimate."}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="commitment-footer">
                      <button
                        className="text-button subtle"
                        onClick={() => setModal("explain")}
                      >
                        How was this calculated?
                        <ArrowUpRight size={14} />
                      </button>
                      <div>
                        <button
                          className="button edit-button"
                          onClick={() => setModal("edit")}
                        >
                          <Pencil size={15} />
                          Edit plan
                        </button>
                        <button
                          className="button primary"
                          onClick={() =>
                            setModal(approved ? "sheet" : "approve")
                          }
                        >
                          {approved ? "View crew sheet" : "Approve plan"}
                          {approved ? (
                            <ClipboardList size={16} />
                          ) : (
                            <ArrowRight size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  </section>

                  <button
                    className="send-phone-banner"
                    onClick={() => {
                      setMessageTab("phone");
                      navigate("Messages");
                    }}
                  >
                    <span className="phone-banner-icon">
                      <Phone size={21} />
                    </span>
                    <span>
                      <strong>Put the plan in the farmer’s hands</strong>
                      <small>
                        Send by SMS. Approve or request a change by reply.
                      </small>
                    </span>
                    <span className="phone-banner-action">
                      Open SMS
                      <ArrowRight size={16} />
                    </span>
                  </button>
                  <section className="crew-section">
                    <div className="section-heading">
                      <div>
                        <h3>
                          The work ahead <span>{state.crew}-person crew</span>
                        </h3>
                        <p>
                          {workingFields.length === 0
                            ? "Packed stock covers today’s orders."
                            : workingFields.length === 1
                              ? "One crew, one field. Finish with time to pack."
                              : "One crew, two fields. Finish with time to pack."}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setModal("sheet")}
                      >
                        Crew sheet
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="field-plan-grid">
                      {workingFields.map((field, i) => (
                        <button
                          className="field-plan-card"
                          key={field.id}
                          onClick={() => setEditField(field)}
                        >
                          <div className="field-plan-art">
                            <FieldDrawing field={field.id} />
                            <span className="sequence-badge">
                              {i + 1}{" "}
                              <span>
                                {i === 0 ? "PICK FIRST" : "THEN MOVE HERE"}
                              </span>
                            </span>
                          </div>
                          <div className="field-plan-info">
                            <div>
                              <h4>
                                {field.name}
                                <ArrowUpRight size={15} />
                              </h4>
                              <span>
                                {formatHour(field.start)} –{" "}
                                {formatHour(field.finish)}
                              </span>
                            </div>
                            <strong>
                              {field.boxes}
                              <span>boxes</span>
                            </strong>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="packing-line">
                      <Package size={16} />
                      <span>
                        {plan.target > 0 ? (
                          <>
                            Packed and ready by{" "}
                            <strong>{formatHour(plan.finish)}</strong>
                          </>
                        ) : (
                          "No picking assignment needed today."
                        )}
                      </span>
                      <span className="packing-right">
                        {plan.target > 0
                          ? "Includes 45 min for packing"
                          : "No picking required"}
                      </span>
                    </div>
                  </section>

                  <section className="orders-preview">
                    <div className="section-heading">
                      <div>
                        <h3>
                          Orders behind the plan{" "}
                          <span>{state.orders.length}</span>
                        </h3>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("Orders")}
                      >
                        View all orders
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="compact-orders">
                      {state.orders.slice(0, 3).map((order, i) => (
                        <button
                          key={order.id}
                          className="compact-order"
                          onClick={() => openOrder(order)}
                        >
                          <span className={`customer-mark color-${i}`}>
                            {order.customer
                              .split(" ")
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <span>
                            <strong>{order.customer}</strong>
                            <small>{order.source}</small>
                          </span>
                          <strong>
                            {order.boxes}
                            <small> boxes</small>
                          </strong>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                      {state.orders.length === 0 && (
                        <p className="empty-inline">
                          Add an order to begin your harvest plan.
                        </p>
                      )}
                    </div>
                  </section>
                </div>

                <aside className="context-column">
                  <WeatherCard
                    cutoff={state.rainHour}
                    onEditCutoff={() => setModal("inputs")}
                  />

                  <section className="yield-card">
                    <div className="card-top">
                      <h3>Yield estimate</h3>
                      <span className="confidence">Moderate</span>
                    </div>
                    <p>
                      The field walk suggests{" "}
                      <strong>{plan.estimate} usable boxes</strong>. Actual
                      yield can vary.
                    </p>
                    <div className="yield-range">
                      <div className="range-labels">
                        <span>{plan.low}</span>
                        <span>{plan.high} boxes</span>
                      </div>
                      <div className="range-track">
                        <span
                          style={{
                            left: `${Math.max(0, Math.min(100, ((plan.target - plan.low) / (plan.high - plan.low || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="range-target">
                        <span />
                        Your plan: {plan.target} boxes
                      </div>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setModal("explain")}
                    >
                      See the assumptions
                      <ArrowUpRight size={14} />
                    </button>
                  </section>

                  <section className="field-note-card">
                    <div className="card-top">
                      <span className="eyebrow">Latest field note</span>
                      <span>{state.fields[0].checked}</span>
                    </div>
                    <p>“{state.fields[0].note}”</p>
                    <div>
                      <span className="note-author">
                        <span className="mini-avatar">JW</span>Jamie · Field B
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Edit Field B observation"
                        onClick={() => setEditField(state.fields[0])}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </section>
                  <div className="human-note">
                    <Leaf size={17} />
                    <p>
                      Your field knowledge comes first.
                      <br />
                      Every plan needs your approval.
                    </p>
                  </div>
                </aside>
              </div>
              <footer className="page-footer">
                <span>Harvest Commit</span>
                <span>
                  Sample farm data <i /> September 19, 2026
                </span>
              </footer>
            </>
          )}

          {page === "Orders" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">DEMAND, ALL IN ONE PLACE</div>
                  <h1>
                    Orders<span className="heading-period">.</span>
                  </h1>
                  <p>What your customers need for Saturday, September 19.</p>
                </div>
                <button
                  className="button primary heading-action"
                  onClick={() => openOrder()}
                >
                  <Plus size={17} />
                  Add order
                </button>
              </div>
              <button
                className="order-review-banner"
                onClick={() => {
                  setMessageTab("inbox");
                  navigate("Messages");
                }}
              >
                <MessageSquare size={19} />
                <span>
                  <strong>Review the source before changing an order</strong>
                  <small>
                    Check messages, amendments, and duplicates in the inbox.
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
              <div className="page-stat-line">
                <div>
                  <strong>{plan.demand}</strong>
                  <span>boxes ordered</span>
                </div>
                <div>
                  <strong>{state.orders.length}</strong>
                  <span>customer orders</span>
                </div>
                <div>
                  <strong>{state.packed}</strong>
                  <span>boxes already packed</span>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("Today")}
                >
                  Back to the harvest plan
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="table-panel">
                <div className="table-toolbar">
                  <label className="search-input">
                    <Search size={17} />
                    <input
                      placeholder="Find a customer…"
                      aria-label="Find a customer"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter by order source"
                    value={orderSource}
                    onChange={(e) => setOrderSource(e.target.value)}
                  >
                    <option>All sources</option>
                    {sources.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Crop</th>
                        <th>Source</th>
                        <th>Received</th>
                        <th className="numeric">Boxes</th>
                        <th>
                          <span className="sr-only">Edit order</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order, i) => {
                        const Icon = sourceIcons[order.source] || Pencil;
                        return (
                          <tr key={order.id}>
                            <td>
                              <button
                                className="customer-cell"
                                onClick={() => openOrder(order)}
                              >
                                <span
                                  className={`customer-mark color-${i % 3}`}
                                >
                                  {order.customer
                                    .split(" ")
                                    .map((w) => w[0])
                                    .slice(0, 2)
                                    .join("")}
                                </span>
                                <strong>{order.customer}</strong>
                              </button>
                            </td>
                            <td>
                              <span className="crop-dot" />
                              Tomatoes
                            </td>
                            <td>
                              <span className="table-source">
                                <Icon size={14} />
                                {order.source}
                              </span>
                            </td>
                            <td className="muted">{order.time}</td>
                            <td className="numeric">
                              <strong>{order.boxes}</strong>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                onClick={() => openOrder(order)}
                                aria-label={`Edit ${order.customer}`}
                              >
                                <Pencil size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>
                          {filteredOrders.length} orders
                          {search || orderSource !== "All sources"
                            ? " in this view"
                            : " for today"}
                        </td>
                        <td className="numeric">
                          {filteredOrders.reduce((n, o) => n + o.boxes, 0)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {filteredOrders.length === 0 && (
                  <div className="empty-state">
                    <Search size={24} />
                    <h3>No orders found</h3>
                    <p>Try another customer name or add your first order.</p>
                  </div>
                )}
              </div>
              <div className="source-help">
                <MessageSquare size={20} />
                <div>
                  <strong>An order came in by text?</strong>
                  <p>
                    Paste the message into a new order, check the details, and
                    add it to the plan.
                  </p>
                </div>
                <button className="text-button" onClick={() => openOrder()}>
                  Add an order
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {page === "Fields" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE OTHER HALF OF THE PICTURE</div>
                  <h1>
                    In the field<span className="heading-period">.</span>
                  </h1>
                  <p>Your observations, translated into a harvest estimate.</p>
                </div>
                <span className="pill">
                  <Leaf size={15} />2 fields · tomatoes
                </span>
              </div>
              <div className="page-stat-line">
                <div>
                  <strong>{plan.estimate}</strong>
                  <span>estimated usable boxes</span>
                </div>
                <div>
                  <strong>
                    {plan.low}–{plan.high}
                  </strong>
                  <span>observed yield range</span>
                </div>
                <div>
                  <strong>{plan.target}</strong>
                  <span>boxes in today's plan</span>
                </div>
              </div>
              <div className="fields-grid">
                {state.fields.map((field, i) => (
                  <section className="field-detail" key={field.id}>
                    <FieldDrawing field={field.id} large />
                    <div className="field-detail-body">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">
                            {i === 0
                              ? "FIRST IN THE PICKING ORDER"
                              : "SECOND IN THE PICKING ORDER"}
                          </span>
                          <h2>{field.name}</h2>
                          <p>{field.area}</p>
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => setEditField(field)}
                        >
                          <Pencil size={14} />
                          Update
                        </button>
                      </div>
                      <div className="field-stat">
                        <strong>
                          {field.estimate}
                          <span>usable boxes</span>
                        </strong>
                        <span>
                          Expected range
                          <br />
                          <b>
                            {field.low}–{field.high} boxes
                          </b>
                        </span>
                      </div>
                      <blockquote>{field.note}</blockquote>
                      <div className="field-checked">
                        <CheckCheck size={15} />
                        Checked at {field.checked}
                        <span>Farmer observation</span>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
              <div className="plain-note">
                <Leaf size={19} />
                <p>
                  Estimates support planning. The farmer checks crop quality and
                  decides what is ready to pick.
                </p>
              </div>
            </>
          )}

          {page === "Harvest log" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CLOSE THE LOOP</div>
                  <h1>
                    Harvest log<span className="heading-period">.</span>
                  </h1>
                  <p>What you planned. What came out of the field.</p>
                </div>
                <button
                  className="button secondary heading-action"
                  onClick={() => {
                    const csv = [
                      "Date,Planned boxes,Actual boxes,Customer demand,Packed stock",
                      ...state.records.map(
                        (r) =>
                          `${r.date},${r.planned},${r.actual ?? ""},${r.demand},${r.packed}`,
                      ),
                    ].join("\n");
                    download(
                      "Harvest Commit - Harvest Log.csv",
                      csv,
                      "text/csv",
                    );
                  }}
                >
                  <ArrowDownToLine size={16} />
                  Export log
                </button>
              </div>
              <div className="log-intro">
                <div className="log-icon">
                  <History size={26} />
                </div>
                <div>
                  <h3>A useful record starts with the actual count.</h3>
                  <p>
                    Record today's packed harvest to compare the commitment with
                    what you brought in.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={!approved}
                  onClick={() => setModal("record")}
                >
                  {state.records.find((r) => r.id === "today")?.actual != null
                    ? "Update actual harvest"
                    : "Record actual harvest"}
                  <Plus size={16} />
                </button>
              </div>
              {!approved && (
                <p className="inline-hint">
                  Approve today's plan before recording the actual harvest.
                </p>
              )}
              <div className="table-panel log-table">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="numeric">Planned</th>
                        <th className="numeric">Actual</th>
                        <th className="numeric">Difference</th>
                        <th>Field notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.records.map((record) => (
                        <tr key={record.id}>
                          <td>
                            <strong>
                              {record.id === "today"
                                ? "Today, Sep 19"
                                : new Date(
                                    record.date + "T12:00:00",
                                  ).toLocaleDateString("en-US", {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}
                            </strong>
                            <small className="table-subtext">
                              {record.id === "today"
                                ? "Your commitment"
                                : record.id.startsWith("sample-")
                                  ? "Sample record"
                                  : "Earlier commitment"}
                            </small>
                          </td>
                          <td className="numeric">
                            {record.planned}{" "}
                            <span className="muted">boxes</span>
                          </td>
                          <td className="numeric">
                            {record.actual == null ? (
                              <span className="pending-label">
                                Awaiting harvest
                              </span>
                            ) : (
                              `${record.actual} boxes`
                            )}
                          </td>
                          <td className="numeric">
                            {record.actual == null ? (
                              "—"
                            ) : (
                              <span
                                className={
                                  record.actual === record.planned
                                    ? "success-text"
                                    : "muted"
                                }
                              >
                                {record.actual - record.planned > 0 ? "+" : ""}
                                {record.actual - record.planned}
                              </span>
                            )}
                          </td>
                          <td className="record-note">{record.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="plain-note">
                <CircleHelp size={18} />
                <p>
                  Historical entries are sample records. This prototype does not
                  claim measured savings or improvements.
                </p>
              </div>
            </>
          )}
        </main>
      </div>

      {modal === "order" && (
        <OrderDialog
          order={editOrder}
          onClose={close}
          onSave={(order) => {
            const orders = editOrder
              ? state.orders.map((o) => (o.id === order.id ? order : o))
              : [...state.orders, order];
            updateInputs(
              { orders },
              editOrder
                ? "Order updated."
                : "Order added. Harvest plan recalculated.",
            );
          }}
          onDelete={
            editOrder
              ? () =>
                  updateInputs(
                    {
                      orders: state.orders.filter((o) => o.id !== editOrder.id),
                    },
                    "Order removed. Harvest plan recalculated.",
                  )
              : undefined
          }
        />
      )}
      {editField && (
        <FieldDialog
          field={editField}
          onClose={close}
          onSave={(field) =>
            updateInputs(
              {
                fields: state.fields.map((f) =>
                  f.id === field.id ? field : f,
                ),
              },
              "Field observation saved. Plan recalculated.",
            )
          }
        />
      )}
      {modal === "inputs" && (
        <InputsDialog
          state={state}
          onClose={close}
          onSave={(patch) =>
            updateInputs(patch, "Farm inputs updated. Plan recalculated.")
          }
        />
      )}
      {modal === "edit" && (
        <EditPlanDialog
          state={state}
          onClose={close}
          onSave={(patch) => updateInputs(patch, "Your changes are saved.")}
        />
      )}
      {modal === "approve" && (
        <Dialog
          title="Make this the day's plan?"
          eyebrow="YOUR CALL"
          onClose={close}
        >
          <div className="dialog-body">
            <div className="approval-summary">
              <span>Tomatoes</span>
              <strong>
                {plan.target}
                <small> boxes to harvest</small>
              </strong>
              <p>
                {state.crew} people ·{" "}
                {workingFields.map((f) => f.name).join(", then ") ||
                  "No picking needed"}{" "}
                · ready by {formatHour(plan.finish)}
              </p>
            </div>
            {(plan.shortfall > 0 || plan.surplus > 0) && (
              <div className="form-warning">
                {plan.shortfall > 0
                  ? `${plan.shortfall} boxes of customer demand are not covered. You will need to follow up with affected customers.`
                  : `${plan.surplus} boxes are above current demand. Confirm you have a use for them.`}
              </div>
            )}
            {plan.conservativeShortfall > plan.shortfall && (
              <div className="form-warning">
                At the low field estimate, {plan.conservativeShortfall} boxes of
                demand would remain uncovered.
              </div>
            )}
            <p className="dialog-description">
              Approving saves this commitment and prepares a crew sheet. You can
              copy or download it to share with your team.
            </p>
            <p className="small-note">
              You make the final call on field conditions and crop readiness.
            </p>
          </div>
          <div className="dialog-footer">
            <button className="button secondary" onClick={close}>
              Keep reviewing
            </button>
            <button className="button primary" onClick={approvePlan}>
              <Check size={16} />
              {plan.shortfall ? "Approve with shortfall" : "Approve commitment"}
            </button>
          </div>
        </Dialog>
      )}
      {modal === "sheet" && (
        <Dialog
          title="The crew's morning sheet"
          eyebrow={
            approved ? "APPROVED COMMITMENT" : "DRAFT · NOT YET APPROVED"
          }
          onClose={close}
          wide
        >
          <div className="dialog-body">
            <pre className="crew-sheet">{crewSheet(state)}</pre>
            {toast && (
              <p className="sheet-feedback" role="status">
                {toast}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <button className="button secondary" onClick={copySheet}>
              <Copy size={16} />
              Copy for a message
            </button>
            <button
              className="button primary"
              onClick={() =>
                download(
                  "Harvest Commit - September 19 Crew Sheet.txt",
                  crewSheet(state),
                )
              }
            >
              <ArrowDownToLine size={16} />
              Download
            </button>
          </div>
        </Dialog>
      )}
      {modal === "explain" && (
        <Dialog
          title="A plan you can trace back"
          eyebrow="BEHIND THE NUMBERS"
          onClose={close}
          wide
        >
          <div className="dialog-body explanation">
            <p>
              Today's proposal combines customer demand with the stock, people,
              and field observations available this morning.
            </p>
            <div className="explain-calculation">
              <span>
                {plan.demand}
                <small>ordered</small>
              </span>
              <b>−</b>
              <span>
                {state.packed}
                <small>packed</small>
              </span>
              <b>=</b>
              <span>
                {plan.needed}
                <small>needed</small>
              </span>
            </div>
            <dl>
              <div>
                <dt>Usable yield</dt>
                <dd>
                  {plan.estimate} boxes, from your two field estimates. Observed
                  range: {plan.low}–{plan.high}.
                </dd>
              </div>
              <div>
                <dt>Available crew</dt>
                <dd>
                  {state.crew} people, starting at {formatHour(state.startHour)}
                  . Planning pace: 3 boxes per person per hour, a demo
                  assumption to verify against your own records.
                </dd>
              </div>
              <div>
                <dt>Weather window</dt>
                <dd>
                  Picking ends before {formatHour(state.rainHour)}, with 45
                  minutes reserved for packing. This gives capacity for{" "}
                  {plan.laborCapacity} boxes.
                </dd>
              </div>
              <div>
                <dt>Picking order</dt>
                <dd>
                  The same crew picks Field B first because the field note flags
                  rain exposure, then moves to Field A. Quantities follow each
                  field's share of estimated usable yield.
                </dd>
              </div>
              <div>
                <dt>Proposed harvest</dt>
                <dd>
                  {plan.target} boxes, capped by field estimates and available
                  crew time.
                  {state.target !== null
                    ? ` Your requested target is ${state.target}.`
                    : ""}{" "}
                  {plan.shortfall
                    ? `${plan.shortfall} boxes of demand remain uncovered.`
                    : "Current orders are covered."}
                </dd>
              </div>
              <div>
                <dt>Uncertainty</dt>
                <dd>
                  “Moderate” describes the sample field estimate; it is not a
                  measured probability. Actual yield and picking pace may
                  differ.
                </dd>
              </div>
            </dl>
            <div className="prototype-note">
              <strong>About this prototype</strong>
              <p>
                Farm records are sample data. Calculations run locally with
                clear rules. The Messages inbox supports optional AI extraction
                and Twilio SMS when configured. Weather comes from Open-Meteo
                for the selected location. The farmer sets the harvest cutoff;
                forecast updates do not change an approved plan. Orders stay in
                this browser; messaging records are stored on the local server.
              </p>
            </div>
          </div>
          <div className="dialog-footer">
            <button
              className="button secondary"
              onClick={() => setModal("inputs")}
            >
              Update inputs
            </button>
            <button className="button primary" onClick={close}>
              Back to the plan
              <ArrowRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {modal === "record" && (
        <RecordDialog
          state={state}
          onClose={close}
          onSave={(actual, note) => {
            setState((s) => ({
              ...s,
              records: s.records.map((r) =>
                r.id === "today" ? { ...r, actual, note } : r,
              ),
            }));
            close();
            setToast("Actual harvest recorded.");
          }}
        />
      )}
      {modal === "reset" && (
        <Dialog
          title="Start a fresh demo?"
          eyebrow="SAMPLE FARM"
          onClose={close}
        >
          <div className="dialog-body">
            <p className="dialog-description">
              This replaces your changes on this device with the original sample
              orders, fields, and harvest records.
            </p>
          </div>
          <div className="dialog-footer">
            <button className="button secondary" onClick={close}>
              Keep my changes
            </button>
            <button
              className="button primary"
              onClick={() => {
                setState({
                  ...structuredClone(seed),
                  revision: crypto.randomUUID(),
                });
                navigate("Today");
                close();
                setToast("Sample farm reset.");
              }}
            >
              Reset demo
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function OrderDialog({
  order,
  onClose,
  onSave,
  onDelete,
}: {
  order: Order | null;
  onClose: () => void;
  onSave: (order: Order) => void;
  onDelete?: () => void;
}) {
  const [customer, setCustomer] = useState(order?.customer || "");
  const [boxes, setBoxes] = useState(order?.boxes.toString() || "");
  const [source, setSource] = useState<Source>(order?.source || "Manual entry");
  const [tab, setTab] = useState<"details" | "message">("details");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (
      !customer.trim() ||
      !Number.isInteger(Number(boxes)) ||
      Number(boxes) < 1
    )
      return;
    onSave({
      ...(order || {}),
      id: order?.id || crypto.randomUUID(),
      customer: customer.trim(),
      boxes: Number(boxes),
      source,
      time:
        order?.time ||
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
    });
  };
  return (
    <Dialog
      title={order ? "Update the order" : "Bring an order into the plan"}
      eyebrow="CUSTOMER ORDERS"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="dialog-body">
          {order?.provenance && (
            <div className="source-document">
              <div>
                <MessageSquare size={15} />
                <strong>Reviewed source message</strong>
              </div>
              <blockquote>{order.provenance.body}</blockquote>
              <footer>
                From {order.provenance.from} ·{" "}
                {order.provenance.extraction === "ai"
                  ? order.provenance.evidence
                    ? `OpenAI (${order.provenance.evidence.model}) suggested`
                    : "AI suggested"
                  : "Locally extracted"}
                , then reviewed by a person
              </footer>
            </div>
          )}
          {!order && (
            <div className="form-tabs">
              <button
                type="button"
                className={tab === "details" ? "selected" : ""}
                onClick={() => setTab("details")}
              >
                Order details
              </button>
              <button
                type="button"
                className={tab === "message" ? "selected" : ""}
                onClick={() => setTab("message")}
              >
                <MessageSquare size={14} />
                Paste a message
              </button>
            </div>
          )}
          {tab === "message" ? (
            <>
              <label className="form-field">
                Customer message
                <textarea
                  autoFocus
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Riverbend Kitchen: 24 boxes of tomatoes for today, please."
                />
              </label>
              <p className="field-hint">
                Use “Customer name: 24 boxes…” to extract an order. You'll
                review the details before saving.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary full-width"
                type="button"
                onClick={() => {
                  const parsed = parseOrderMessage(message);
                  if (!parsed) {
                    setError(
                      "Include the customer name followed by a colon and a quantity, such as “Riverbend Kitchen: 24 boxes”.",
                    );
                    return;
                  }
                  setCustomer(parsed.customer);
                  setBoxes(String(parsed.boxes));
                  setSource("Text message");
                  setError("");
                  setTab("details");
                }}
              >
                Review order details
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <label className="form-field">
                Customer name
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="e.g. Riverbend Kitchen"
                />
              </label>
              <div className="form-row">
                <label className="form-field">
                  Tomato boxes
                  <input
                    type="number"
                    required
                    min="1"
                    max="10000"
                    step="1"
                    value={boxes}
                    onChange={(e) => setBoxes(e.target.value)}
                    placeholder="24"
                  />
                </label>
                <label className="form-field">
                  Order source
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as Source)}
                  >
                    {sources.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-context">
                <Sunrise size={17} />
                <p>
                  For today's harvest, September 19. Saving updates the plan and
                  clears any previous approval.
                </p>
              </div>
            </>
          )}
        </div>
        <div className="dialog-footer">
          {onDelete ? (
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                confirmDelete ? onDelete() : setConfirmDelete(true)
              }
            >
              <Trash2 size={15} />
              {confirmDelete ? "Confirm removal" : "Remove order"}
            </button>
          ) : (
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          )}
          {tab === "details" && (
            <button type="submit" className="button primary">
              {order ? "Save order" : "Add to today’s orders"}
              <Check size={16} />
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function FieldDialog({
  field,
  onClose,
  onSave,
}: {
  field: Field;
  onClose: () => void;
  onSave: (field: Field) => void;
}) {
  const [estimate, setEstimate] = useState(field.estimate);
  const [low, setLow] = useState(field.low);
  const [high, setHigh] = useState(field.high);
  const [note, setNote] = useState(field.note);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={`A fresh look at ${field.name}`}
      eyebrow="FIELD OBSERVATION"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (low > estimate || high < estimate) {
            setError(
              "The estimated yield must sit between the low and high estimates.",
            );
            return;
          }
          onSave({
            ...field,
            estimate,
            low,
            high,
            note,
            checked: new Date().toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }),
          });
        }}
      >
        <div className="dialog-body">
          <p className="dialog-description">
            Record what you see. The harvest plan will adjust to your estimate.
          </p>
          <label className="form-field">
            Expected usable boxes
            <input
              autoFocus
              type="number"
              min="0"
              max="10000"
              step="1"
              required
              value={estimate}
              onChange={(e) => setEstimate(Number(e.target.value))}
            />
          </label>
          <div className="form-row">
            <label className="form-field">
              Low estimate
              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                required
                value={low}
                onChange={(e) => setLow(Number(e.target.value))}
              />
            </label>
            <label className="form-field">
              High estimate
              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                required
                value={high}
                onChange={(e) => setHigh(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="form-field">
            Field note
            <textarea
              rows={4}
              required
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save observation
            <Check size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function InputsDialog({
  state,
  onClose,
  onSave,
}: {
  state: FarmState;
  onClose: () => void;
  onSave: (patch: Partial<FarmState>) => void;
}) {
  const [packed, setPacked] = useState(state.packed);
  const [crew, setCrew] = useState(state.crew);
  const [start, setStart] = useState(state.startHour);
  const [rain, setRain] = useState(state.rainHour);
  const [error, setError] = useState("");
  const times = Array.from({ length: 33 }, (_, i) => 4 + i / 2);
  return (
    <Dialog title="Set up the morning" eyebrow="FARM INPUTS" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (rain <= start + 0.75) {
            setError(
              "Leave at least 45 minutes between the start and cutoff for packing.",
            );
            return;
          }
          onSave({ packed, crew, startHour: start, rainHour: rain });
        }}
      >
        <div className="dialog-body">
          <p className="dialog-description">
            A few numbers keep the plan grounded in the day you actually have.
          </p>
          <div className="form-row">
            <label className="form-field">
              Boxes already packed
              <input
                autoFocus
                type="number"
                min="0"
                max="10000"
                required
                step="1"
                value={packed}
                onChange={(e) => setPacked(Number(e.target.value))}
              />
            </label>
            <label className="form-field">
              People on harvest
              <input
                type="number"
                min="1"
                max="15"
                required
                step="1"
                value={crew}
                onChange={(e) => setCrew(Number(e.target.value))}
              />
              <span className="field-hint">From your 15-person farm team</span>
            </label>
          </div>
          <div className="form-row">
            <label className="form-field">
              Crew starts
              <select
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              >
                {times.map((t) => (
                  <option key={t} value={t}>
                    {formatHour(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Harvest cutoff
              <select
                value={rain}
                onChange={(e) => setRain(Number(e.target.value))}
              >
                {times.map((t) => (
                  <option key={t} value={t}>
                    {formatHour(t)}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Set after reviewing the local forecast.
              </span>
            </label>
          </div>
          <div className="form-context">
            <Tractor size={19} />
            <p>
              Planning allows 3 boxes per person per hour and 45 minutes for
              packing. These are sample operating assumptions.
            </p>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Update the plan
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EditPlanDialog({
  state,
  onClose,
  onSave,
}: {
  state: FarmState;
  onClose: () => void;
  onSave: (patch: Partial<FarmState>) => void;
}) {
  const current = makePlan(state);
  const [target, setTarget] = useState(current.target);
  const [note, setNote] = useState(state.planNote);
  const preview = makePlan({ ...state, target });
  return (
    <Dialog
      title="Make the plan your own"
      eyebrow="FARMER ADJUSTMENT"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ target, planNote: note });
        }}
      >
        <div className="dialog-body">
          <label className="form-field">
            Boxes to harvest
            <input
              autoFocus
              required
              type="number"
              min="0"
              max={current.capacity}
              step="1"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
            <span className="field-hint">
              Up to {current.capacity} boxes with current yield and crew time.
            </span>
          </label>
          <div
            className={`edit-preview ${preview.shortfall ? "has-risk" : ""}`}
          >
            <span>
              {preview.shortfall
                ? "Demand still uncovered"
                : preview.surplus
                  ? "Above current orders"
                  : "Customer orders covered"}
            </span>
            <strong>
              {preview.shortfall
                ? `${preview.shortfall} boxes`
                : preview.surplus
                  ? `${preview.surplus} boxes`
                  : `${preview.demand} / ${preview.demand}`}
            </strong>
          </div>
          <label className="form-field">
            A note for the crew <span className="optional">optional</span>
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the team should know before heading out…"
            />
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setTarget(Math.min(current.needed, current.capacity))
            }
          >
            Use the recommended quantity
            <ArrowLeft size={14} />
          </button>
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save changes
            <Check size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RecordDialog({
  state,
  onClose,
  onSave,
}: {
  state: FarmState;
  onClose: () => void;
  onSave: (actual: number, note: string) => void;
}) {
  const today = state.records.find((r) => r.id === "today");
  const [actual, setActual] = useState(today?.actual?.toString() || "");
  const [note, setNote] = useState(today?.actual != null ? today.note : "");
  return (
    <Dialog
      title="What came in from the field?"
      eyebrow="ACTUAL HARVEST"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(Number(actual), note || "Actual harvest recorded.");
        }}
      >
        <div className="dialog-body">
          <p className="dialog-description">
            Today's commitment was <strong>{today?.planned} boxes</strong>.
            Enter the actual usable harvest, excluding the {state.packed} boxes
            already in stock.
          </p>
          <label className="form-field">
            Boxes harvested
            <input
              autoFocus
              type="number"
              min="0"
              max="10000"
              step="1"
              required
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="108"
            />
          </label>
          <label className="form-field">
            End-of-day note <span className="optional">optional</span>
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What went well, or what changed?"
            />
          </label>
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save actual harvest
            <Check size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default App;
