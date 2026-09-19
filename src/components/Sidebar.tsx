import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import clintonAvatar from "../assets/clinton-avatar.png";
import {
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  History,
  LayoutGrid,
  MessageSquare,
  Settings2,
  SidebarToggle,
  Sprout,
  Sunrise,
  X,
  ArrowDownToLine,
} from "../icons";

export type Page = "Today" | "Orders" | "Fields" | "Harvest log" | "Messages";

type Props = {
  page: Page;
  orderCount: number;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (page: Page) => void;
  onToggle: () => void;
  onCloseMobile: () => void;
  onAction: (action: "inputs" | "explain" | "reset") => void;
  onBackup?: () => void;
  onSignOut?: () => Promise<void>;
};

const navigation = [
  { name: "Today", icon: Sunrise },
  { name: "Orders", icon: ClipboardList },
  { name: "Messages", icon: MessageSquare },
  { name: "Fields", icon: LayoutGrid },
  { name: "Harvest log", icon: History },
] as const;

export function Sidebar({
  page,
  orderCount,
  collapsed,
  mobileOpen,
  onNavigate,
  onToggle,
  onCloseMobile,
  onAction,
  onBackup,
  onSignOut,
}: Props) {
  const [menu, setMenu] = useState<"workspace" | "account" | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const workspaceTrigger = useRef<HTMLButtonElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMenu(null), [collapsed, mobileOpen]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("[role^='menuitem']")?.focus();
    const clickOutside = (event: PointerEvent) => {
      const container = menu === "workspace" ? workspaceRef : accountRef;
      if (!container.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", clickOutside);
    return () => document.removeEventListener("pointerdown", clickOutside);
  }, [menu]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "b" &&
        !target.closest("input, textarea, select, [contenteditable='true']") &&
        window.matchMedia("(min-width: 769px)").matches
      ) {
        event.preventDefault();
        onToggle();
      }
      if (event.key === "Escape" && mobileOpen && !menu) onCloseMobile();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onToggle, onCloseMobile, mobileOpen, menu]);

  function handleMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      (menu === "workspace"
        ? workspaceTrigger
        : accountTrigger
      ).current?.focus();
      setMenu(null);
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role^='menuitem']"),
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (current + 1) % items.length
        : event.key === "ArrowUp"
          ? (current - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  function act(action: "inputs" | "explain" | "reset") {
    setMenu(null);
    onCloseMobile();
    onAction(action);
  }

  return (
    <>
      {mobileOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`harvest-sidebar ${mobileOpen ? "open" : ""}`}
        aria-label="Harvest Commit"
      >
        <div className="sidebar-inner">
          <div className="sidebar-brand-row">
            <div className="workspace-switcher" ref={workspaceRef}>
              <button
                ref={workspaceTrigger}
                className="workspace-switcher-button"
                aria-label="Workspace menu"
                aria-haspopup="menu"
                aria-expanded={menu === "workspace"}
                aria-controls="farm-workspace-menu"
                onClick={() =>
                  setMenu(menu === "workspace" ? null : "workspace")
                }
              >
                <span className="workspace-avatar-container">
                  <span className="workspace-avatar">
                    <Sprout size={18} />
                  </span>
                </span>
                <span className="workspace-name">Pine Hollow Farm</span>
                <ChevronDown className="workspace-chevron" size={24} />
              </button>
              {menu === "workspace" && (
                <div
                  ref={menuRef}
                  id="farm-workspace-menu"
                  className="sidebar-popover workspace-popover"
                  role="menu"
                  aria-label="Workspace"
                  onKeyDown={handleMenuKeys}
                  onBlur={(event) => {
                    if (!workspaceRef.current?.contains(event.relatedTarget))
                      setMenu(null);
                  }}
                >
                  <div className="sidebar-popover-inner">
                    <div className="workspace-menu-header">
                      <span className="workspace-avatar">
                        <Sprout size={28} />
                      </span>
                      <div>
                        <p>Pine Hollow Farm</p>
                        <span>Current workspace</span>
                      </div>
                    </div>
                    <p className="workspace-section-label">Your farm</p>
                    <button
                      className="sidebar-menu-item workspace-current"
                      role="menuitemcheckbox"
                      aria-checked="true"
                      onClick={() => {
                        setMenu(null);
                        workspaceTrigger.current?.focus();
                      }}
                    >
                      <span className="workspace-avatar">
                        <Sprout size={18} />
                      </span>
                      <span>Pine Hollow Farm</span>
                      <Check size={16} />
                    </button>
                    <div className="sidebar-menu-divider" role="separator" />
                    <button
                      className="sidebar-menu-item"
                      role="menuitem"
                      onClick={() => act("inputs")}
                    >
                      <Settings2 size={20} />
                      <span>Farm inputs</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="sidebar-collapse"
              aria-label={
                collapsed ? "Expand navigation" : "Collapse navigation"
              }
              title={`${collapsed ? "Expand" : "Collapse"} navigation (⌘B)`}
              data-state={collapsed ? "closed" : "open"}
              onClick={onToggle}
            >
              <SidebarToggle size={18} />
            </button>
            <button
              className="sidebar-mobile-close"
              aria-label="Close sidebar"
              onClick={onCloseMobile}
            >
              <X size={18} />
            </button>
          </div>
          <nav className="sidebar-nav" aria-label="Main navigation">
            {navigation.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={`sidebar-nav-item ${page === name ? "active" : ""}`}
                aria-label={name === "Orders" ? `Orders ${orderCount}` : name}
                aria-current={page === name ? "page" : undefined}
                title={name}
                onClick={() => {
                  setMenu(null);
                  onNavigate(name);
                }}
              >
                <span className="sidebar-nav-icon">
                  <Icon size={20} />
                </span>
                <span className="sidebar-nav-label">{name}</span>
                {name === "Orders" && (
                  <span className="sidebar-nav-badge">{orderCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-user" ref={accountRef}>
            <button
              ref={accountTrigger}
              className="sidebar-user-button"
              aria-label="Farm account menu"
              aria-haspopup="menu"
              aria-expanded={menu === "account"}
              aria-controls="farm-account-menu"
              title="Farm account menu"
              onClick={() => setMenu(menu === "account" ? null : "account")}
            >
              <span className="sidebar-user-avatar">
                <img
                  src={clintonAvatar}
                  alt=""
                  width={32}
                  height={32}
                  draggable={false}
                />
              </span>
              <span className="sidebar-user-info">
                <span className="sidebar-user-name">Clinton Imaro</span>
                <span className="sidebar-user-description">Farm manager</span>
              </span>
              <ChevronDown
                className={`sidebar-user-chevron ${menu === "account" ? "open" : ""}`}
                size={14}
              />
            </button>
            {menu === "account" && (
              <div
                ref={menuRef}
                id="farm-account-menu"
                className="sidebar-popover account-popover"
                role="menu"
                aria-label="Farm account"
                onKeyDown={handleMenuKeys}
                onBlur={(event) => {
                  if (!accountRef.current?.contains(event.relatedTarget))
                    setMenu(null);
                }}
              >
                <div className="sidebar-popover-inner">
                  <button
                    className="sidebar-menu-item"
                    role="menuitem"
                    onClick={() => act("inputs")}
                  >
                    <Settings2 size={20} />
                    <span>Farm inputs</span>
                  </button>
                  <button
                    className="sidebar-menu-item"
                    role="menuitem"
                    onClick={() => act("explain")}
                  >
                    <CircleHelp size={20} />
                    <span>About this plan</span>
                  </button>
                  <div className="sidebar-menu-divider" role="separator" />
                  {onBackup && (
                    <button
                      className="sidebar-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        onBackup();
                      }}
                    >
                      <ArrowDownToLine size={20} />
                      <span>Download workspace backup</span>
                    </button>
                  )}
                  {onSignOut && (
                    <button
                      className="sidebar-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        void onSignOut();
                      }}
                    >
                      <X size={20} />
                      <span>Sign out</span>
                    </button>
                  )}
                  <button
                    className="sidebar-menu-item"
                    role="menuitem"
                    onClick={() => act("reset")}
                  >
                    <History size={20} />
                    <span>Reset demo data</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
