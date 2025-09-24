"use client"

import * as React from "react"

type Props = { id?: string; className?: string }

export function LanguageIcon({ id, className }: Props) {
  switch (id) {
    case "javascript":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="JavaScript">
          <rect width="24" height="24" rx="4" fill="#f7df1e" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#000">JS</text>
        </svg>
      )
    case "typescript":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="48" height="48" rx="8" fill="#3178c6" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">TS</text>
        </svg>
      )
    case "python":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Python">
          <rect width="24" height="24" rx="4" fill="transparent" />
          {/* top-left blue shape */}
          <rect x="3" y="2" width="10" height="10" rx="2.2" fill="#3776ab" />
          {/* bottom-right yellow shape */}
          <rect x="11" y="12" width="10" height="10" rx="2.2" fill="#ffd43b" />
          {/* eyes */}
          <circle cx="8" cy="6" r="1" fill="#fff" />
          <circle cx="16" cy="18" r="1" fill="#fff" />
        </svg>
      )
    case "java":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Java">
          <rect width="24" height="24" rx="5" fill="#5382a1" />
          <path d="M7 7c1-1 6-2 8 0-1 1-5 2-8 0z" fill="#fff" opacity="0.95" />
          <path d="M9 11c2-1 4-1 6 0v3a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-3z" fill="#fff" opacity="0.95" />
        </svg>
      )
    case "csharp":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#239120" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">C#</text>
        </svg>
      )
    case "cpp":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#00599c" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">C++</text>
        </svg>
      )
    case "ruby":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#cc342d" />
          <path d="M12 6l4 6-4 6-4-6 4-6z" fill="#fff" opacity="0.95" />
        </svg>
      )
    case "go":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#00add8" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">Go</text>
        </svg>
      )
    case "rust":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#dea584" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="10" fontWeight="700" fill="#000">Rs</text>
        </svg>
      )
    case "swift":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#f05138" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">Sw</text>
        </svg>
      )
    case "kotlin":
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#7f52ff" />
          <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">Kt</text>
        </svg>
      )
    default:
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#999" />
        </svg>
      )
  }
}

export default LanguageIcon


