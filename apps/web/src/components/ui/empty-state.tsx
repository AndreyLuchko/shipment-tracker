import type { ReactNode } from 'react';

/** "Nothing here": a title, an optional sentence and an optional action. Not an error, so no `role`. */
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description !== undefined && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      {children !== undefined && <div className="mt-4">{children}</div>}
    </div>
  );
}
