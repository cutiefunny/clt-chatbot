"use client";

const ChevronDownIcon = ({ size = 16, style = {}, isRotated = false }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      ...style,
      transition: "transform 0.2s ease-in-out",
      transform: isRotated ? "rotate(-180deg)" : "rotate(0deg)",
    }}
  >
    <path
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default ChevronDownIcon;
