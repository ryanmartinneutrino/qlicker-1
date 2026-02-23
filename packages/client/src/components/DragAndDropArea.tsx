import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'

type DragAndDropAreaProps = {
  onDrop: (file: File) => void | Promise<void>
  acceptedFiles?: string[]
  maxFiles?: number
  className?: string
  children?: ReactNode
  disabled?: boolean
}

function isAccepted(file: File, acceptedFiles: string[]): boolean {
  if (acceptedFiles.length === 0) return true
  return acceptedFiles.some((accepted) => {
    if (accepted.endsWith('/*')) {
      const prefix = accepted.slice(0, -1)
      return file.type.startsWith(prefix)
    }
    return file.type === accepted
  })
}

export function DragAndDropArea({
  onDrop,
  acceptedFiles = ['image/jpeg', 'image/png', 'image/gif'],
  maxFiles = 1,
  className,
  children,
  disabled = false,
}: DragAndDropAreaProps) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const pickValidFiles = (files: File[]): File[] => {
    const accepted = files.filter((file) => isAccepted(file, acceptedFiles))
    return accepted.slice(0, maxFiles)
  }

  const forwardFiles = (files: File[]) => {
    if (disabled || files.length === 0) return
    pickValidFiles(files).forEach((file) => {
      void onDrop(file)
    })
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    forwardFiles(files)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : []
    forwardFiles(files)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!disabled) setDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
  }

  const classes = [className, dragActive ? 'drag-active' : ''].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          fileInputRef.current?.click()
        }
      }}
      aria-disabled={disabled}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFiles.join(',')}
        multiple={maxFiles > 1}
        style={{ display: 'none' }}
        onChange={handleInputChange}
        disabled={disabled}
      />
      {children}
    </div>
  )
}
