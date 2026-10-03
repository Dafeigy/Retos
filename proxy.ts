import { NextResponse, type NextRequest } from "next/server"

import { sessionConfig, verifySessionToken } from "@/lib/auth/session"

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(sessionConfig.cookieName)?.value
  const isAuthenticated = await verifySessionToken(token)

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/components/:path*",
    "/movements/:path*",
    "/alerts/:path*",
    "/settings/:path*",
    "/bom/:path*",
    "/waitlist/:path*",
    "/api/components/:path*",
    "/api/movements/:path*",
    "/api/bom-projects/:path*",
  ],
}
