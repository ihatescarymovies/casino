/// <reference path="astro:middleware" />

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

declare namespace App {
  interface Locals {
    user: AuthUser | null;
  }
}
