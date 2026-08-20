'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api-client';
import { HealthResponse } from '../types/health';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Server, Database, Layers, Shield } from 'lucide-react';

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Operational
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Degraded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Unavailable
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-6 md:p-12">
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">WorkTrackor</h1>
            <p className="text-xs text-slate-400">Hierarchical Office Task Tracker</p>
          </div>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Checking...' : 'Refresh Status'}
        </button>
      </header>

      <main className="max-w-5xl mx-auto w-full my-auto py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-medium text-slate-300 mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            Foundation Milestone Active
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-50 tracking-tight">
            System Infrastructure Status
          </h2>
          <p className="text-slate-400 mt-2 max-w-xl mx-auto text-sm">
            Verifying end-to-end communication across the Next.js frontend, Fastify API, PostgreSQL, and Redis cache.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">Backend Connection Issue</h3>
              <p className="text-xs text-rose-300/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Fastify API Status Card */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Server className="w-5 h-5" />
                </div>
                {getStatusBadge(health?.status)}
              </div>
              <h3 className="text-base font-semibold text-slate-200">API Service</h3>
              <p className="text-xs text-slate-400 mt-1">
                Fastify HTTP engine, rate limiting, security headers, and structured logging.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Environment:</span>
                <span className="font-mono text-slate-300">{health?.environment || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Uptime:</span>
                <span className="font-mono text-slate-300">{health?.uptimeSeconds ? `${health.uptimeSeconds}s` : '—'}</span>
              </div>
            </div>
          </div>

          {/* PostgreSQL Status Card */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Database className="w-5 h-5" />
                </div>
                {getStatusBadge(health?.services?.database?.status)}
              </div>
              <h3 className="text-base font-semibold text-slate-200">PostgreSQL (Primary)</h3>
              <p className="text-xs text-slate-400 mt-1">
                Authoritative persistence source, Prisma ORM, migrations, and connection pooling.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="font-mono text-slate-300">
                  {health?.services?.database?.latencyMs !== undefined ? `${health.services.database.latencyMs}ms` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Engine:</span>
                <span className="font-mono text-slate-300">PostgreSQL 16</span>
              </div>
            </div>
          </div>

          {/* Redis Status Card */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Layers className="w-5 h-5" />
                </div>
                {getStatusBadge(health?.services?.redis?.status)}
              </div>
              <h3 className="text-base font-semibold text-slate-200">Redis (Cache & Pub/Sub)</h3>
              <p className="text-xs text-slate-400 mt-1">
                In-memory caching, rate limit storage, presence tracking, and job queue backend.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="font-mono text-slate-300">
                  {health?.services?.redis?.latencyMs !== undefined ? `${health.services.redis.latencyMs}ms` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Engine:</span>
                <span className="font-mono text-slate-300">Redis 7</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto w-full text-center border-t border-slate-800/60 pt-4 text-xs text-slate-500 flex flex-col md:flex-row justify-between items-center gap-2">
        <p>Hierarchical Office Task Tracker • Production Monorepo Foundation</p>
        <p>Last check: {lastChecked ? lastChecked.toLocaleTimeString() : 'Never'}</p>
      </footer>
    </div>
  );
}
