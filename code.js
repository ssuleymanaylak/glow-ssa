/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event));
})

const visitCounts = new Map();
const rateLimits = new Map();

async function handleRequest(event) {
  const { request } = event;
  const url = new URL(request.url);
  const stream = url.searchParams.get("stream") === "true";
  const authorization = request.headers.get("Authorization");
  
  if (!authorization || !/^Bearer USER\d{3}$/.test(authorization)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = authorization.slice(7);
  const userNumber = parseInt(userId.slice(4), 10);

  // Handle rate limiting
  const currentTime = Math.floor(Date.now() / 60000);
  const rateLimitKey = `${userId}:${currentTime}`;
  const visitCount = visitCounts.get(userId) || 0;
  const rateLimitCount = rateLimits.get(rateLimitKey) || 0;

  if (rateLimitCount >= 4) {
    return new Response('Rate Limit Exceeded', { status: 429 });
  }

  visitCounts.set(userId, visitCount + 1);
  rateLimits.set(rateLimitKey, rateLimitCount + 1);

  // Compute group using a simple hash
  const group = (userNumber % 10) + 1;

  const responsePayload = {
    message: `Welcome USER_${userNumber}, this is your visit #${visitCount + 1}`,
    group,
    rate_limit_left: 4 - (rateLimitCount + 1),
    stream_seq: 0,
  };

  if (!stream) {
    return new Response(JSON.stringify(responsePayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return handleStreamResponse(event, responsePayload);
}

async function handleStreamResponse(event, payload) {
  let sequence = 0;
  return new Response(
    new ReadableStream({
      start(controller) {
        function push() {
          if (sequence < 5) {
            payload.stream_seq = sequence++;
            controller.enqueue(new TextEncoder().encode(JSON.stringify(payload) + '\n'));
            setTimeout(push, 1000);
          } else {
            controller.close();
          }
        }
        push();
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    }
  );
}
