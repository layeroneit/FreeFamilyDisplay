import { NextResponse, type NextRequest } from "next/server";

export const DISPLAY_COOKIE = "ffd_display";

/**
 * A wall screen reaches /d/<token> with no session. The page renders fine,
 * but the images inside it are separate browser requests that carry no token,
 * so the media routes would refuse them.
 *
 * This drops the token into an httpOnly cookie scoped to /media so those
 * requests can be authorised against the same board — and no wider. A server
 * component cannot set cookies, which is why this lives in middleware.
 *
 * The cookie is the same bearer secret already in the URL, so it grants
 * nothing extra; it is httpOnly so page scripts cannot read it back out.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const token = req.nextUrl.pathname.split("/")[2] ?? "";
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    res.cookies.set(DISPLAY_COOKIE, token, {
      httpOnly: true,
      secure: (process.env.APP_URL ?? "").startsWith("https://"),
      sameSite: "lax",
      path: "/media",
      maxAge: 400 * 24 * 60 * 60,
    });
  }
  return res;
}

export const config = { matcher: "/d/:token" };
