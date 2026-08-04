// src/config/logger.js
// ─────────────────────────────────────────────────────────────────────────────
// Centralized logger. winston was already in package.json — installed,
// never imported anywhere. Every log line in this app was a raw
// console.log/console.error: no levels, no consistent structure, nothing
// you could point a log aggregator (Render's own log search, Datadog,
// whatever) at reliably. Render's log viewer works fine for tailing, but
// it can't filter by severity or parse fields out of a plain string the
// way it can with structured JSON lines.
//
// In production this emits structured JSON (one object per line — parseable
// by any log pipeline). In development it emits colorized, readable lines.
// Same API either way: logger.info(...), logger.warn(...), logger.error(...).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const winston = require('winston');

const isProd = process.env.NODE_ENV === 'production';

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  format: isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  // Don't crash the process if a log write itself fails
  exitOnError: false,
});

module.exports = logger;
