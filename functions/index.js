"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

/**
 * The key never leaves the server: set it once with
 *   firebase functions:secrets:set OPENAI_API_KEY
 */
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const MODEL = "gpt-image-2.5-flare";
/** Only the cheap tiers are exposed; `high` and above cost 10-40x more. */
const QUALITIES = new Set(["low", "medium"]);
/** Images per signed-in user per UTC day. Raise it deliberately, it is the spend guard-rail. */
const DAILY_LIMIT = 60;

// gpt-image-2.5 custom sizes: multiples of 16, ratio at most 3:1, 655,360 to 8,294,400 pixels.
// We cap well below the maximum because output tokens (= cost) scale with pixel count.
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 1_600_000;
const MAX_EDGE = 2048;

function validateSize(width, height) {
  const ok =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width % 16 === 0 &&
    height % 16 === 0 &&
    width <= MAX_EDGE &&
    height <= MAX_EDGE &&
    width * height >= MIN_PIXELS &&
    width * height <= MAX_PIXELS &&
    Math.max(width, height) / Math.min(width, height) <= 3;
  if (!ok) throw new HttpsError("invalid-argument", "Unsupported image size.");
}

/** Counts this request against the user's daily allowance, or throws `resource-exhausted`. */
async function takeAllowance(uid) {
  const db = getFirestore();
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.doc(`usage/${uid}_${day}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? (snap.get("images") ?? 0) : 0;
    if (used >= DAILY_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily limit of ${DAILY_LIMIT} OpenAI images reached. It resets at 00:00 UTC.`,
      );
    }
    tx.set(ref, { uid, day, images: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return ref;
}

async function refundAllowance(ref) {
  try {
    await ref.update({ images: FieldValue.increment(-1) });
  } catch (err) {
    console.warn("could not refund allowance", err.message);
  }
}

function mapOpenAiError(status, body) {
  const code = body?.error?.code ?? "";
  const message = body?.error?.message ?? "";
  if (code === "moderation_blocked" || /safety system|content policy/i.test(message)) {
    return new HttpsError(
      "invalid-argument",
      "OpenAI's safety system rejected this prompt. Try rewording it.",
    );
  }
  if (status === 401) {
    return new HttpsError("failed-precondition", "The OpenAI key on the server is invalid.");
  }
  if (code === "insufficient_quota" || code === "billing_hard_limit_reached" || /quota|billing/i.test(message)) {
    return new HttpsError("resource-exhausted", "The OpenAI account is out of credit or at its spending limit.");
  }
  if (status === 429) {
    return new HttpsError("resource-exhausted", "OpenAI is rate-limiting requests. Try again in a minute.");
  }
  if (status === 400) {
    return new HttpsError("invalid-argument", message.slice(0, 200) || "OpenAI rejected the request.");
  }
  return new HttpsError("internal", "OpenAI couldn't generate the image. Try again.");
}

exports.generateImage = onCall(
  {
    region: "europe-west1",
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 180,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to generate images.");

    const { prompt, width, height, quality } = request.data ?? {};
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
      throw new HttpsError("invalid-argument", "Enter a prompt of up to 4000 characters.");
    }
    if (!QUALITIES.has(quality)) throw new HttpsError("invalid-argument", "Unsupported quality.");
    validateSize(width, height);

    const allowance = await takeAllowance(request.auth.uid);

    let res;
    try {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
        },
        body: JSON.stringify({
          model: MODEL,
          prompt: prompt.trim(),
          size: `${width}x${height}`,
          quality,
          n: 1,
          output_format: "jpeg",
          output_compression: 85,
        }),
        signal: AbortSignal.timeout(150_000),
      });
    } catch (err) {
      await refundAllowance(allowance);
      console.error("openai request failed", err.name);
      throw new HttpsError("unavailable", "Couldn't reach OpenAI. Try again.");
    }

    const body = await res.json().catch(() => null);
    const image = body?.data?.[0]?.b64_json;
    if (!res.ok || !image) {
      await refundAllowance(allowance);
      console.error("openai error", res.status, body?.error?.code, body?.error?.message);
      throw mapOpenAiError(res.status, body);
    }

    return { image, mimeType: "image/jpeg", model: MODEL, quality };
  },
);
