import { useState, useEffect, useCallback } from 'react';
import {
  Box, Tabs, Tab, Typography, TextField, Button, Checkbox,
  FormControlLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TablePagination, Select, MenuItem,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  InputAdornment, Alert, Snackbar, FormControl, InputLabel,
  CircularProgress, Tooltip,
} from '@mui/material';
import { Delete as DeleteIcon, Search as SearchIcon, Add as AddIcon, CheckCircle, Cancel } from '@mui/icons-material';
import apiClient from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { formatDisplayDate } from '../../utils/date';

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

// ── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState({
    restrictDomain: false,
    allowedDomains: '',
    requireVerified: false,
    adminEmail: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    apiClient.get('/settings').then(({ data }) => {
      setSettings({
        restrictDomain: data.restrictDomain ?? false,
        allowedDomains: Array.isArray(data.allowedDomains)
          ? data.allowedDomains.join(', ')
          : data.allowedDomains ?? '',
        requireVerified: data.requireVerified ?? false,
        adminEmail: data.adminEmail ?? '',
      });
    }).catch(() => setMsg({ severity: 'error', text: 'Failed to load settings' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...settings,
        allowedDomains: settings.allowedDomains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      };
      await apiClient.patch('/settings', payload);
      setMsg({ severity: 'success', text: 'Settings saved' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress />;

  return (
    <Box component="form" sx={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControlLabel
        control={<Checkbox checked={settings.restrictDomain} onChange={(e) => setSettings((s) => ({ ...s, restrictDomain: e.target.checked }))} />}
        label="Restrict email domain"
      />
      <TextField
        label="Allowed Domains (comma-separated)"
        value={settings.allowedDomains}
        onChange={(e) => setSettings((s) => ({ ...s, allowedDomains: e.target.value }))}
        fullWidth
      />
      <FormControlLabel
        control={<Checkbox checked={settings.requireVerified} onChange={(e) => setSettings((s) => ({ ...s, requireVerified: e.target.checked }))} />}
        label="Require verified email"
      />
      <TextField
        label="Admin Email"
        value={settings.adminEmail}
        onChange={(e) => setSettings((s) => ({ ...s, adminEmail: e.target.value }))}
        fullWidth
      />
      <Button variant="contained" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>
      {msg && (
        <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>
      )}
    </Box>
  );
}

// ── Users Tab ───────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', firstname: '', lastname: '', role: 'student' });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const { data } = await apiClient.get('/users', { params });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId, role) => {
    try {
      await apiClient.patch(`/users/${userId}/role`, { role });
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, profile: { ...u.profile, roles: [role] } } : u)));
      setMsg({ severity: 'success', text: 'Role updated' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to update role' });
    }
  };

  const handleVerifyEmail = async (userId) => {
    try {
      await apiClient.patch(`/users/${userId}/verify-email`);
      fetchUsers();
      setMsg({ severity: 'success', text: 'Email verified' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to verify email' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/users/${deleteTarget._id}`);
      setDeleteTarget(null);
      fetchUsers();
      setMsg({ severity: 'success', text: 'User deleted' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to delete user' });
    }
  };

  const handleCreate = async () => {
    try {
      await apiClient.post('/users', newUser);
      setCreateOpen(false);
      setNewUser({ email: '', password: '', firstname: '', lastname: '', role: 'student' });
      fetchUsers();
      setMsg({ severity: 'success', text: 'User created' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.error || 'Failed to create user' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Role</InputLabel>
          <Select value={roleFilter} label="Role" onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="professor">Professor</MenuItem>
            <MenuItem value="student">Student</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Create User
        </Button>
        <Typography variant="body2" sx={{ ml: 'auto' }}>Total: {total}</Typography>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Verified</TableCell>
              <TableCell>Last Login</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center">No users found</TableCell></TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u._id}>
                  <TableCell>{u.profile?.firstname} {u.profile?.lastname}</TableCell>
                  <TableCell>{u.emails?.[0]?.address}</TableCell>
                  <TableCell>
                    {u.emails?.[0]?.verified ? (
                      <Tooltip title="Verified">
                        <CheckCircle color="success" fontSize="small" />
                      </Tooltip>
                    ) : (
                      <Tooltip title="Click to verify">
                        <IconButton size="small" onClick={() => handleVerifyEmail(u._id)}>
                          <Cancel color="error" fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.lastLogin
                      ? formatDisplayDate(u.lastLogin)
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={u._id === currentUserId ? 'You cannot change your own role' : ''}>
                      <span>
                        <Select
                          size="small"
                          value={u.profile?.roles?.[0] ?? 'student'}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                          disabled={u._id === currentUserId}
                        >
                          <MenuItem value="admin">admin</MenuItem>
                          <MenuItem value="professor">professor</MenuItem>
                          <MenuItem value="student">student</MenuItem>
                        </Select>
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton color="error" size="small" onClick={() => setDeleteTarget(u)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete <strong>{deleteTarget?.profile?.firstname} {deleteTarget?.profile?.lastname}</strong> ({deleteTarget?.emails?.[0]?.address})?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create User</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="Email" type="email" required value={newUser.email} onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))} />
          <TextField label="Password" type="password" required value={newUser.password} onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))} />
          <TextField label="First Name" required value={newUser.firstname} onChange={(e) => setNewUser((s) => ({ ...s, firstname: e.target.value }))} />
          <TextField label="Last Name" required value={newUser.lastname} onChange={(e) => setNewUser((s) => ({ ...s, lastname: e.target.value }))} />
          <FormControl>
            <InputLabel>Role</InputLabel>
            <Select value={newUser.role} label="Role" onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value }))}>
              <MenuItem value="admin">admin</MenuItem>
              <MenuItem value="professor">professor</MenuItem>
              <MenuItem value="student">student</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

// ── Storage Tab ─────────────────────────────────────────────────────────────
function StorageTab() {
  const [storageType, setStorageType] = useState('local');
  const [s3, setS3] = useState({ AWS_bucket: '', AWS_region: '', AWS_accessKeyId: '', AWS_secretAccessKey: '' });
  const [azure, setAzure] = useState({ Azure_storageAccount: '', Azure_storageAccessKey: '', Azure_storageContainer: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    apiClient.get('/settings').then(({ data }) => {
      setStorageType(data.storageType ?? 'local');
      setS3({
        AWS_bucket: data.AWS_bucket ?? '',
        AWS_region: data.AWS_region ?? '',
        AWS_accessKeyId: data.AWS_accessKeyId ?? '',
        AWS_secretAccessKey: data.AWS_secretAccessKey ?? '',
      });
      setAzure({
        Azure_storageAccount: data.Azure_storageAccount ?? '',
        Azure_storageAccessKey: data.Azure_storageAccessKey ?? '',
        Azure_storageContainer: data.Azure_storageContainer ?? '',
      });
    }).catch(() => setMsg({ severity: 'error', text: 'Failed to load storage settings' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { storageType };
      if (storageType === 's3') Object.assign(payload, s3);
      if (storageType === 'azure') Object.assign(payload, azure);
      await apiClient.patch('/settings', payload);
      setMsg({ severity: 'success', text: 'Storage settings saved' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to save storage settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress />;

  return (
    <Box sx={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControl fullWidth>
        <InputLabel>Storage Type</InputLabel>
        <Select value={storageType} label="Storage Type" onChange={(e) => setStorageType(e.target.value)}>
          <MenuItem value="local">Local</MenuItem>
          <MenuItem value="s3">Amazon S3</MenuItem>
          <MenuItem value="azure">Azure Blob Storage</MenuItem>
        </Select>
      </FormControl>

      {storageType === 's3' && (
        <>
          <TextField label="Bucket" value={s3.AWS_bucket} onChange={(e) => setS3((s) => ({ ...s, AWS_bucket: e.target.value }))} fullWidth />
          <TextField label="Region" value={s3.AWS_region} onChange={(e) => setS3((s) => ({ ...s, AWS_region: e.target.value }))} fullWidth />
          <TextField label="Access Key ID" value={s3.AWS_accessKeyId} onChange={(e) => setS3((s) => ({ ...s, AWS_accessKeyId: e.target.value }))} fullWidth />
          <TextField label="Secret Access Key" type="password" value={s3.AWS_secretAccessKey} onChange={(e) => setS3((s) => ({ ...s, AWS_secretAccessKey: e.target.value }))} fullWidth />
        </>
      )}

      {storageType === 'azure' && (
        <>
          <TextField label="Storage Account" value={azure.Azure_storageAccount} onChange={(e) => setAzure((s) => ({ ...s, Azure_storageAccount: e.target.value }))} fullWidth />
          <TextField label="Storage Access Key" type="password" value={azure.Azure_storageAccessKey} onChange={(e) => setAzure((s) => ({ ...s, Azure_storageAccessKey: e.target.value }))} fullWidth />
          <TextField label="Storage Container" value={azure.Azure_storageContainer} onChange={(e) => setAzure((s) => ({ ...s, Azure_storageContainer: e.target.value }))} fullWidth />
        </>
      )}

      <Button variant="contained" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Storage Settings'}
      </Button>
      {msg && <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>}
    </Box>
  );
}

// ── SSO Tab ─────────────────────────────────────────────────────────────────
function SSOTab() {
  const ssoFields = [
    { key: 'SSO_enabled', label: 'Enable SSO', type: 'checkbox' },
    { key: 'SSO_entrypoint', label: 'IDP Entry Point URL' },
    { key: 'SSO_logoutUrl', label: 'IDP Logout URL' },
    { key: 'SSO_EntityId', label: 'Entity ID (e.g. qlicker)' },
    { key: 'SSO_identifierFormat', label: 'Identifier Format' },
    { key: 'SSO_institutionName', label: 'Institution Name' },
    { key: 'SSO_emailIdentifier', label: 'Email Identifier' },
    { key: 'SSO_firstNameIdentifier', label: 'First Name Identifier' },
    { key: 'SSO_lastNameIdentifier', label: 'Last Name Identifier' },
    { key: 'SSO_roleIdentifier', label: 'Role Identifier' },
    { key: 'SSO_roleProfName', label: 'Name of professor role for auto-promote' },
    { key: 'SSO_studentNumberIdentifier', label: 'Student Number Identifier' },
    { key: 'SSO_cert', label: 'IDP Certificate (single string, no BEGIN-END)', type: 'textarea' },
    { key: 'SSO_privCert', label: 'SP Public Certificate (can contain BEGIN-END)', type: 'textarea' },
    { key: 'SSO_privKey', label: 'SP Private Key (WITH BEGIN-END)', type: 'textarea' },
  ];

  const [settings, setSettings] = useState(() =>
    Object.fromEntries(ssoFields.map((f) => [f.key, f.type === 'checkbox' ? false : '']))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    apiClient.get('/settings').then(({ data }) => {
      const next = {};
      for (const f of ssoFields) {
        next[f.key] = data[f.key] ?? (f.type === 'checkbox' ? false : '');
      }
      setSettings(next);
    }).catch(() => setMsg({ severity: 'error', text: 'Failed to load SSO settings' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.patch('/settings', settings);
      setMsg({ severity: 'success', text: 'SSO settings saved' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to save SSO settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress />;

  return (
    <Box sx={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {ssoFields.map((f) =>
        f.type === 'checkbox' ? (
          <FormControlLabel
            key={f.key}
            control={<Checkbox checked={!!settings[f.key]} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.checked }))} />}
            label={f.label}
          />
        ) : f.type === 'textarea' ? (
          <TextField
            key={f.key}
            label={f.label}
            value={settings[f.key]}
            onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
            multiline
            minRows={4}
            fullWidth
          />
        ) : (
          <TextField
            key={f.key}
            label={f.label}
            value={settings[f.key]}
            onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
            fullWidth
          />
        )
      )}
      <Button variant="contained" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save SSO Settings'}
      </Button>
      {msg && <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>}
    </Box>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab] = useState(0);
  const { user } = useAuth();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Admin Dashboard</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Settings" />
        <Tab label="Users" />
        <Tab label="Storage" />
        <Tab label="SSO Configuration" />
      </Tabs>
      <TabPanel value={tab} index={0}><SettingsTab /></TabPanel>
      <TabPanel value={tab} index={1}><UsersTab currentUserId={user?._id} /></TabPanel>
      <TabPanel value={tab} index={2}><StorageTab /></TabPanel>
      <TabPanel value={tab} index={3}><SSOTab /></TabPanel>
    </Box>
  );
}
