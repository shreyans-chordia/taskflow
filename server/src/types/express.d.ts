declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth once the access token has been verified. */
      userId?: string;
    }
  }
}

export {};
