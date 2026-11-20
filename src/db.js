import crypto from "node:crypto";

export function createDb() {
  const byId = new Map();
  const byEmail = new Map();

  return {
    createUser({ email, passwordHash }) {
      if (byEmail.has(email.toLowerCase())) return { error: "An account with this email already exists." };
      const id = crypto.randomBytes(16).toString("hex");
      const user = { id, email: email.toLowerCase(), passwordHash, createdAt: Date.now() };
      byId.set(id, user);
      byEmail.set(user.email, user);
      return { value: user };
    },
    findUserByEmail(email) {
      return byEmail.get(email.toLowerCase()) ?? null;
    },
    findUserById(id) {
      return byId.get(id) ?? null;
    },
  };
}
