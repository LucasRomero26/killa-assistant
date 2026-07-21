import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getBackendUrl } from "@/lib/api";

const METHODS_ALLOWED = new Set(["GET", "POST", "DELETE", "PATCH", "PUT"]);

async function authenticateAndGetSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

function validatePath(searchParams: URLSearchParams) {
  const backendPath = searchParams.get("path");
  if (!backendPath || !backendPath.startsWith("/api/")) {
    return null;
  }
  return backendPath;
}

function buildBackendUrl(backendPath: string) {
  return new URL(backendPath, getBackendUrl()).toString();
}

async function proxyRequest(
  url: string,
  method: string,
  body?: string | undefined,
  accessToken?: string
) {
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
  };

  // Only send Content-Type: application/json when we actually have a body.
  // Fastify rejects requests that declare a JSON content-type but have an
  // empty body ("Body cannot be empty when content-type is set to
  // 'application/json'"), which is exactly what happens on DELETE endpoints
  // that take no body (e.g. /api/auth/google/disconnect).
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const backendRes = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const data = await backendRes.text();
    return new NextResponse(data, {
      status: backendRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 }
    );
  }
}

async function handleRequest(request: Request, method: string) {
  const { searchParams } = new URL(request.url);
  const backendPath = validatePath(searchParams);

  if (!backendPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!METHODS_ALLOWED.has(method)) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const session = await authenticateAndGetSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: string | undefined;
  if (method !== "GET") {
    try {
      const raw = await request.text();
      // Only forward a body if the client actually sent one. For DELETE this
      // is typically empty, and forwarding an empty string would cause Fastify
      // to reject the request if we also set Content-Type: application/json.
      if (raw.length > 0) {
        body = raw;
      }
    } catch {
      body = undefined;
    }
  }

  const url = buildBackendUrl(backendPath);
  return proxyRequest(url, method, body, session.access_token);
}

export async function GET(request: Request) {
  return handleRequest(request, "GET");
}

export async function POST(request: Request) {
  return handleRequest(request, "POST");
}

export async function DELETE(request: Request) {
  return handleRequest(request, "DELETE");
}

export async function PATCH(request: Request) {
  return handleRequest(request, "PATCH");
}

export async function PUT(request: Request) {
  return handleRequest(request, "PUT");
}
