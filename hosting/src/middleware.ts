import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Define public paths that don't require authentication
  const publicPaths = ["/", "/login", "/auth-callback", "/api/auth"];
  
  // Check if the requested path is public
  const isPublicPath = publicPaths.some(publicPath => path.startsWith(publicPath));

  // Get the auth token from cookies
  const authToken = request.cookies.get("auth_token")?.value;

  // If user is NOT authenticated and tries to access a protected route → Redirect to login
  if (!isPublicPath && !authToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If user is already authenticated and tries to visit login → Redirect to dashboard
  if (path === "/login" && authToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

// Apply middleware to all paths except static assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|public).*)",
  ],
};
