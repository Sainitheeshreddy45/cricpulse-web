export default function Button({
  children, className = '', variant = 'primary', type = 'button', ...props
}) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
