export default function PageShell({ title, subtitle, icon: Icon, actions, children }) {
  return (
    <div className="theme-page-root">
      <div className="theme-card theme-glass p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {Icon && (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Icon className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold theme-page-title">{title}</h1>
            {subtitle && <p className="text-sm theme-page-muted mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function FormField({ label, required, error, children, hint }) {
  return (
    <div>
      <label className="theme-label">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="theme-hint">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function SectionCard({ title, icon: Icon, children, className = "" }) {
  return (
    <div className={`theme-card theme-glass p-5 ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold theme-page-title mb-4 flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-blue-500" />}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
