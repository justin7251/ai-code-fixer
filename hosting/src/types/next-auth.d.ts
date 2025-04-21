import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    provider?: string;
    githubUsername?: string;
    githubId?: string;
    user: {
      id?: string;
      name?: string;
      email?: string;
      image?: string;
      username?: string;
    }
  }

  interface User {
    id: string;
    name?: string;
    email?: string;
    image?: string;
    username?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    provider?: string;
    githubUsername?: string;
    githubId?: string;
  }
}

// Extend the default Profile interface
declare module "next-auth" {
  interface Profile {
    login?: string;
    id?: number | string;
    avatar_url?: string;
    name?: string;
    email?: string;
  }
}