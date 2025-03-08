import { NextApiRequest, NextApiResponse } from 'next';
import cookie from "cookie";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    const cookies = cookie.parse(req.headers.cookie || "");
    const error = cookies.auth_error || "Unknown error";

    // Clear the error cookie after reading
    res.setHeader("Set-Cookie", "auth_error=; HttpOnly; Path=/; Max-Age=0");

    res.json({ error });
}
