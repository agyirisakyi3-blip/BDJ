import { avatarHue, avatarInitials } from '../../utils';

/**
 * Shows an employee's uploaded photo if present, otherwise the initials avatar.
 * `size` controls the CSS dimension (default is inherited by the .avatar class).
 */
export default function PhotoAvatar({ name, email, photo, size }) {
  const hue = avatarHue(email || name);
  if (photo && photo.indexOf('data:') === 0) {
    return (
      <img
        className={'person-avatar photo' + (size ? ' sz-' + size : '')}
        src={photo}
        alt={name || email || ''}
        style={size ? { width: size, height: size } : undefined}
      />
    );
  }
  return (
    <span
      className="avatar"
      style={
        size
          ? { width: size, height: size, fontSize: Math.round(size * 0.36), background: `linear-gradient(135deg, hsl(${hue}, 70%, 84%), hsl(${(hue + 40) % 360}, 62%, 68%))`, color: `hsl(${hue}, 58%, 28%)` }
          : { background: `linear-gradient(135deg, hsl(${hue}, 70%, 84%), hsl(${(hue + 40) % 360}, 62%, 68%))`, color: `hsl(${hue}, 58%, 28%)` }
      }
    >
      {avatarInitials(name, email)}
    </span>
  );
}
