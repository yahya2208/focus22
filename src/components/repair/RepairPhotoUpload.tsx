import { memo, useRef } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

interface RepairPhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
}

export const RepairPhotoUpload = memo(function RepairPhotoUpload({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  disabled = false,
}: RepairPhotoUploadProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = maxPhotos - photos.length;
    const toRead = Array.from(files).slice(0, remaining);
    if (toRead.length === 0) return;
    const results: string[] = [];
    let pending = toRead.length;
    toRead.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          results.push(reader.result);
        }
        pending--;
        if (pending === 0) {
          onPhotosChange([...photos, ...results]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  const canAdd = photos.length < maxPhotos && !disabled;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
          {t('repair.addPhotos')}
        </span>
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
          ({t('repair.optional')})
        </span>
      </div>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          {photos.map((photo, i) => (
            <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
              <img
                src={photo}
                alt={`Photo ${i + 1}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                }}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: colors.danger,
                    color: '#fff',
                    border: 'none',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    padding: 0,
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
              padding: '8px 16px',
              background: colors.glass,
              border: `1px solid ${colors.glassBorder}`,
              borderRadius: '10px',
              color: colors.text,
              fontSize: '0.8rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s ease',
            }}
          >
            {t('repair.addPhotos')}
          </button>
        </>
      )}
    </div>
  );
});
