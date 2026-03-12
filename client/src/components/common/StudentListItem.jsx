import { Avatar, Box, ListItem, ListItemAvatar, ListItemText, Typography, Dialog, DialogContent, DialogActions, Button } from '@mui/material';
import { useState } from 'react';

/**
 * Reusable component for showing a student in a list.
 *
 * Shows: name, email (greyed out second line), clickable avatar (opens full-size
 * profile image).  Clicking anywhere else on the row triggers `onClick` if provided.
 *
 * @param {Object}   props
 * @param {Object}   props.student          – student user object ({ _id, profile, emails })
 * @param {Function} [props.onClick]        – called when the row (not avatar) is clicked
 * @param {React.ReactNode} [props.action]  – optional trailing action (e.g. icon button)
 * @param {Object}   [props.sx]            – extra sx passed to outer ListItem
 */
export default function StudentListItem({ student, onClick, action, sx }) {
  const [imageViewUrl, setImageViewUrl] = useState(null);

  const firstname = student?.profile?.firstname || '';
  const lastname = student?.profile?.lastname || '';
  const displayName = `${firstname} ${lastname}`.trim() || 'Unknown';
  const email = student?.emails?.[0]?.address || student?.email || '';
  const avatarSrc = student?.profile?.profileImage || student?.profile?.profileThumbnail || '';
  const initials = (firstname?.[0] || '').toUpperCase() || (email?.[0] || '?').toUpperCase();

  return (
    <>
      <ListItem
        sx={{
          cursor: onClick ? 'pointer' : 'default',
          '&:hover': onClick ? { bgcolor: 'action.hover' } : undefined,
          pr: action ? 8 : undefined,
          ...sx,
        }}
        onClick={onClick}
        secondaryAction={action}
      >
        <ListItemAvatar>
          <Avatar
            src={avatarSrc}
            sx={{
              width: 36,
              height: 36,
              cursor: avatarSrc ? 'pointer' : 'default',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (avatarSrc) setImageViewUrl(student?.profile?.profileImage || avatarSrc);
            }}
          >
            {initials}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={displayName}
          secondary={
            <Typography variant="body2" color="text.secondary" component="span" noWrap>
              {email}
            </Typography>
          }
        />
      </ListItem>

      {/* Full-size image viewer */}
      <Dialog open={!!imageViewUrl} onClose={() => setImageViewUrl(null)} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: 'center', p: 2 }}>
          <img
            src={imageViewUrl}
            alt={displayName}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageViewUrl(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
