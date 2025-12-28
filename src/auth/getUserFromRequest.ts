import jwt from "jsonwebtoken";
import { UserRole } from "../graphql/enums/UserRole";

export function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return undefined;

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as {
      userId: string;
      role: UserRole;
    };
    return decoded;
  } catch {
    return undefined;
  }
}

