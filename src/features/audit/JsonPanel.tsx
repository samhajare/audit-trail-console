import type { JsonValue } from '../../types/audit';

export function JsonPanel({
  title,
  value,
  description,
}: {
  title: string;
  value: JsonValue;
  description?: string;
}) {
  return (
    <section className="panel json-panel" aria-label={title}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      <pre tabIndex={0} aria-label={`${title} JSON`}>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </section>
  );
}
