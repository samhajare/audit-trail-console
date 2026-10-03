import { Link } from 'react-router-dom';

// Reserve the dashboard link destination without implementing the F5 detail view.
export function EventDetailUnavailablePage() {
  return (
    <section className="panel">
      <h1>Event details</h1>
      <p>The event detail view is not available yet.</p>
      <Link to="/">Return to dashboard</Link>
    </section>
  );
}
