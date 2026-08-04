/*
 * Lazy ZeroMQ boundary for the Jupyter kernel.
 *
 * An npm/source installation loads the ordinary zeromq package. A Sage.js
 * single executable extracts its embedded Node-API addon and exposes the
 * three socket classes used by the kernel through tools/resources.ts.
 */

import { runtimeRequire } from "./resources";

const zeroMQ = runtimeRequire("zeromq") as typeof import("zeromq");

export const Publisher = zeroMQ.Publisher;
export const Reply = zeroMQ.Reply;
export const Router = zeroMQ.Router;

export type Publisher = import("zeromq").Publisher;
export type Reply = import("zeromq").Reply;
export type Router = import("zeromq").Router;
