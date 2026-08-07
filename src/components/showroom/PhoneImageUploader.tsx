import { memo, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { compressImages } from '../../services/image-service';

interface PhoneImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export const PhoneImageUploader = memo(function PhoneImageUploader({
  images,
  onImagesChange,
  maxImages,
  disabled = false,
}: PhoneImageUploaderProps) {
  const colors = useThemeColors();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const unlimited = maxImages == null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = unlimited ? files.length : maxImages - images.length;
    const toRead = Array.from(files).slice(0, remaining);
    if (toRead.length === 0) return;
    setBusy(true);
    try {
      const compressed = await compressImages(toRead);
      onImagesChange(unlimited ? [...images, ...compressed] : [...images, ...compressed].slice(0, maxImages));
    } finally {
      setBusy(false);
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };

  const canAdd = (unlimited || images.length < maxImages) && !disabled && !busy;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.text }}>
          صور الهاتف (اختياري)
        </span>
        <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>
          تُضغط تلقائياً — تُعرض في المعرض
        </span>
      </div>

      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          {images.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: '72px', height: '72px' }}>
              <img
                src={src}
                alt={`Phone photo ${i + 1}`}
                loading="lazy"
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  borderRadius: '10px',
                  border: `1px solid ${colors.border}`,
                  background: colors.bgInput,
                }}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  style={{
                    position: 'absolute', top: '-6px', right: '-6px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: colors.danger, color: '#fff',
                    border: 'none', fontSize: '0.7rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            style={{
              padding: '8px 14px', background: colors.glass,
              border: `1px dashed ${colors.glassBorder}`,
              borderRadius: '10px', color: colors.text,
              fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.accent + '66'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.glassBorder; }}
          >
            {busy ? 'جارِ الضغط...' : `+ إضافة صور (${images.length}${unlimited ? '' : `/${maxImages}`})`}
          </button>
        </>
      )}
    </div>
  );
});
