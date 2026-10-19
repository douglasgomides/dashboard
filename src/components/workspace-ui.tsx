import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Mesma linguagem de interação nos dois produtos; o papel e as regras continuam nos consumidores. */
export function WorkspaceButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`ws-action ws-action--${variant} ${className}`}
    >
      {children}
    </button>
  );
}

export function WorkspaceEmpty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ws-empty">
      <span className="ws-empty-icon" aria-hidden>
        <Icon size={24} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        {action && <div className="ws-empty-action">{action}</div>}
      </div>
    </div>
  );
}
