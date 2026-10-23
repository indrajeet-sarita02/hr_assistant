import Link from "next/link";

export default function RootNotFound() {
  return (
    <main className="standalone-state" role="main">
      <div className="state-card">
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <div className="cluster justify-center">
          <Link className="btn btn-primary" href="/en">
            Career home
          </Link>
          <Link className="btn btn-secondary" href="/hi">
            करियर होम
          </Link>
        </div>
      </div>
    </main>
  );
}
