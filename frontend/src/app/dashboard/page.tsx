"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import { getDashboardStats, type DashboardStats } from "@/lib/api";

// Dynamically import chart components with SSR disabled — recharts uses
// browser APIs (ResizeObserver, window) that break during server rendering.
const SubmissionsChart = dynamic(
  () => import("@/components/DashboardCharts").then((m) => m.SubmissionsChart),
  { ssr: false },
);
const TopFormsChart = dynamic(
  () => import("@/components/DashboardCharts").then((m) => m.TopFormsChart),
  { ssr: false },
);

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load dashboard stats");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <LoadingOverlay message="Loading dashboard" />;

  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--cream)" }}>
      <AppHeader title="Dashboard" showBack showLogo />

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

      <main className="dashboard-main">
        {stats && (
          <>
            {/* Stat Cards */}
            <div className="stat-cards">
              <StatCard label="Total Forms" value={stats.total_forms} icon="◫" />
              <StatCard label="Total Submissions" value={stats.total_submissions} icon="▤" />
              <StatCard label="Today" value={stats.today_submissions} icon="◉" accent />
            </div>

            {/* Submissions Chart (Last 30 Days) */}
            <section className="widget">
              <h2 className="widget__title">Submissions — Last 30 Days</h2>
              <div className="widget__chart" style={{ minHeight: 220 }}>
                <SubmissionsChart data={stats.daily} />
              </div>
            </section>

            {/* Top Forms */}
            <section className="widget">
              <h2 className="widget__title">Top Forms</h2>
              <div
                className="widget__chart"
                style={{ minHeight: Math.max(180, stats.top_forms.length * 36 + 20) }}
              >
                <TopFormsChart data={stats.top_forms} />
              </div>
            </section>

            {/* Recent Submissions */}
            <section className="widget">
              <h2 className="widget__title">Recent Submissions</h2>
              {stats.recent_submissions.length > 0 ? (
                <ul className="recent-list">
                  {stats.recent_submissions.map((sub) => (
                    <li key={sub.id} className="recent-item">
                      <span className="recent-item__title">{sub.form_title}</span>
                      <span className="recent-item__time">
                        {formatRelativeTime(sub.submitted_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="widget__empty">No submissions yet</p>
              )}
            </section>
          </>
        )}
      </main>

      <style jsx>{`
        .dashboard-main {
          max-width: 560px;
          margin: 0 auto;
          padding: 20px 18px 40px;
        }

        .stat-cards {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 28px;
        }

        .widget {
          margin-bottom: 28px;
        }
        .widget__title {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--charcoal);
          margin: 0 0 14px 0;
        }
        .widget__chart {
          background: var(--paper);
          border: 1px solid var(--rule);
          padding: 16px 12px;
          width: 100%;
        }
        .widget__empty {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--stone);
          text-align: center;
          padding: 24px 0;
          margin: 0;
        }

        .recent-list {
          list-style: none;
          margin: 0;
          padding: 0;
          border: 1px solid var(--rule);
        }
        .recent-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--rule);
          gap: 12px;
        }
        .recent-item:last-child {
          border-bottom: none;
        }
        .recent-item__title {
          font-family: var(--font-newsreader), Georgia, serif;
          font-size: 14px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .recent-item__time {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 10px;
          color: var(--stone);
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-card" data-accent={accent || undefined}>
      <span className="stat-card__icon" aria-hidden>
        {icon}
      </span>
      <span className="stat-card__value">{value.toLocaleString()}</span>
      <span className="stat-card__label">{label}</span>

      <style jsx>{`
        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 16px 8px;
          border: 1px solid var(--rule);
          background: var(--paper);
          text-align: center;
        }
        .stat-card[data-accent] {
          border-color: var(--clay);
        }
        .stat-card__icon {
          font-size: 18px;
          color: var(--stone);
          line-height: 1;
        }
        .stat-card[data-accent] .stat-card__icon {
          color: var(--clay);
        }
        .stat-card__value {
          font-family: var(--font-newsreader), Georgia, serif;
          font-size: 26px;
          font-weight: 400;
          color: var(--ink);
          line-height: 1.1;
        }
        .stat-card[data-accent] .stat-card__value {
          color: var(--clay);
        }
        .stat-card__label {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--stone);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
