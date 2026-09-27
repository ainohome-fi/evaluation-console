import { Redis } from '@upstash/redis';
import { normalizeAndValidateAcquisition } from './lib/acquisition/engine.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  automaticDeserialization: false,
});

const JOB_PREFIX = 'aino:acq:job:';
const QUEUE_KEY = 'aino:acq:queue';

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function validAliExpressUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'aliexpress.com' || host.endsWith('.aliexpress.com') || host === 'a.aliexpress.com';
  } catch { return false; }
}

function jobKey(id) { return `${JOB_PREFIX}${id}`; }
function makeJobId() { return `acq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
async function readJob(id) {
  const raw = await redis.get(jobKey(id));
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
async function writeJob(job) {
  await redis.set(jobKey(job.id), JSON.stringify(job));
}

function requireUser(req, res) {
  const password = req.headers['x-app-password'];
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function requireWorker(req, res) {
  const token = req.headers['x-aino-worker-token'];
  if (!process.env.AINO_WORKER_TOKEN || token !== process.env.AINO_WORKER_TOKEN) {
    res.status(401).json({ error: 'Unauthorized worker' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = parseBody(req);
    const action = body.action || 'enqueue';

    if (action === 'next' || action === 'complete' || action === 'fail') {
      if (!requireWorker(req, res)) return;
      return workerAction(action, body, res);
    }

    if (!requireUser(req, res)) return;

    if (action === 'enqueue') {
      if (!validAliExpressUrl(body.url)) {
        return res.status(400).json({ ok: false, status: 'FAILED', error: 'INVALID_ALIEXPRESS_URL', message: 'Only AliExpress product URLs are accepted.' });
      }
      const id = makeJobId();
      const job = {
        id,
        status: 'QUEUED',
        supplier: 'ALIEXPRESS',
        url: body.url.trim(),
        destination: body.destination || 'FI',
        currency: 'EUR',
        language: body.language || 'en_US',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await writeJob(job);
      await redis.rpush(QUEUE_KEY, id);
      return res.status(202).json({ ok: true, status: 'QUEUED', job_id: id });
    }

    if (action === 'status') {
      const job = await readJob(body.job_id);
      if (!job) return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND' });
      return res.status(200).json({ ok: true, ...job });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('[aino-acquisition]', error);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: error?.message || 'Acquisition service failed.' });
  }
}

async function workerAction(action, body, res) {
  if (action === 'next') {
    const id = await redis.lpop(QUEUE_KEY);
    if (!id) return res.status(200).json({ ok: true, status: 'EMPTY' });
    const job = await readJob(id);
    if (!job) return res.status(200).json({ ok: true, status: 'EMPTY' });
    job.status = 'RUNNING';
    job.started_at = new Date().toISOString();
    job.updated_at = job.started_at;
    await writeJob(job);
    return res.status(200).json({ ok: true, status: 'JOB', job });
  }

  const job = await readJob(body.job_id);
  if (!job) return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND' });

  if (action === 'fail') {
    job.status = 'FAILED';
    job.error = body.error || 'Browser worker failed.';
    job.updated_at = new Date().toISOString();
    await writeJob(job);
    return res.status(200).json({ ok: true, status: job.status });
  }

  const result = normalizeAndValidateAcquisition({
    url: job.url,
    destination: job.destination,
    raw: body.raw,
    retrievedAt: body.retrieved_at || new Date().toISOString(),
    provider: 'aino-browser-worker',
  });

  job.status = result.status;
  job.result = result.product;
  job.updated_at = new Date().toISOString();
  job.completed_at = job.updated_at;
  if (result.error) job.error = result.error;
  await writeJob(job);
  return res.status(200).json({ ok: true, status: job.status });
}
