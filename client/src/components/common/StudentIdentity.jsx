import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export default function StudentIdentity({
  student,
  showEmail = true,
  avatarSize = 36,
  onClick,
  nameVariant = 'body2',
  emailVariant = 'caption',
  nameWeight = 600,
  sx,
}) {
  const { t } = useTranslation();
  const [imageViewUrl, setImageViewUrl] = useState(null);

  const firstname = normalizeValue(student?.profile?.firstname || student?.firstname);
  const lastname = normalizeValue(student?.profile?.lastname || student?.lastname);
  const email = normalizeValue(student?.emails?.[0]?.address || student?.email);
  const displayName = useMemo(() => {
    const fullName = `${firstname} ${lastname}`.trim();
    return fullName || normalizeValue(student?.displayName) || email || t('common.unknown');
  }, [email, firstname, lastname, student?.displayName, t]);
  const avatarSrc = normalizeValue(
    student?.profile?.profileImage
      || student?.profile?.profileThumbnail
      || student?.profileImage
      || student?.profileThumbnail
  );
  const fullImageSrc = normalizeValue(student?.profile?.profileImage || student?.profileImage || avatarSrc);
  const initials = `${firstname.charAt(0)}${lastname.charAt(0)}`.trim()
    || email.charAt(0)
    || '?';

  return (
    <>
      <Box
        onClick={onClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
          cursor: onClick ? 'pointer' : 'default',
          ...sx,
        }}
      >
        <Avatar
          src={avatarSrc}
          sx={{
            width: avatarSize,
            height: avatarSize,
            cursor: fullImageSrc ? 'pointer' : 'default',
            flexShrink: 0,
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (fullImageSrc) {
              setImageViewUrl(fullImageSrc);
            }
          }}
        >
          {initials.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant={nameVariant} sx={{ fontWeight: nameWeight }} noWrap>
            {displayName}
          </Typography>
          {showEmail && email ? (
            <Typography variant={emailVariant} color="text.secondary" sx={{ display: 'block' }} noWrap>
              {email}
            </Typography>
          ) : null}
        </Box>
      </Box>

      <Dialog open={!!imageViewUrl} onClose={() => setImageViewUrl(null)} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: 'center', p: 2 }}>
          <img
            src={imageViewUrl || ''}
            alt={displayName}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageViewUrl(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
