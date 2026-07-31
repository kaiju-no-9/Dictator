export default function Home() {
  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1>🎬 Dictator</h1>
      <p>AI Video Editor — Phase 1 MVP</p>
      <hr />
      <section>
        <h2>Quick Start</h2>
        <ol>
          <li>Create a project</li>
          <li>Upload video clips</li>
          <li>AI generates an Edit Plan</li>
          <li>Review and adjust the plan</li>
          <li>Export your video</li>
        </ol>
      </section>
      <section style={{ marginTop: '2rem' }}>
        <h2>Services Status</h2>
        <ul>
          <li>API: <code>http://localhost:8000/health</code></li>
          <li>AI Service: <code>http://localhost:8001/health</code></li>
        </ul>
      </section>
    </main>
  );
}
