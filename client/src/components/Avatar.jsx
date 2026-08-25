import React from 'react';

export const initials = (n = '') =>
  n.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

/**
 * A designer's profile picture, or their initials when there is none.
 * Initials are the fallback rather than a stock silhouette so a person
 * without a picture is still identifiable at a glance in a member list.
 */
export default function Avatar({ user, size = 26, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) };
  if (user?.avatar) {
    return (
      <img
        className={`avatar avatar--img ${className}`}
        style={style}
        src={user.avatar}
        alt=""
        aria-hidden="true"
      />
    );
  }
  return (
    <span className={`avatar ${className}`} style={style} aria-hidden="true">
      {initials(user?.name)}
    </span>
  );
}
