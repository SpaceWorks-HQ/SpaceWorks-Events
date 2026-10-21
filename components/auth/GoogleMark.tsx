/** Google's "G", for the Google sign-in button. */
export function GoogleMark(props: { size?: number }) {
  const size = props.size ?? 18;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="block">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.48 1.22 8.9 3.4l6.6-6.6C35.52 2.8 30.12 0 24 0 14.64 0 6.56 5.38 2.6 13.2l7.74 6.02C12.2 13.1 17.62 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M47.5 24.5c0-1.62-.14-3.18-.4-4.7H24v9.02h13.2c-.58 3-2.28 5.54-4.84 7.26l7.44 5.78C44.2 37.9 47.5 31.8 47.5 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.34 28.52A14.5 14.5 0 0 1 9.5 24c0-1.58.26-3.1.84-4.52L2.6 13.2A23.94 23.94 0 0 0 0 24c0 3.88.94 7.54 2.6 10.8l7.74-6.28z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.12 0 11.52-2.02 15.8-5.52l-7.44-5.78c-2.06 1.4-4.7 2.22-8.36 2.22-6.38 0-11.8-3.6-13.66-9.42L2.6 34.8C6.56 42.62 14.64 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
