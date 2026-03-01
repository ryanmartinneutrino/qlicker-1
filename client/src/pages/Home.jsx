import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Container } from '@mui/material';

export default function Home() {
  const navigate = useNavigate();
  return (
    <Container maxWidth="md">
      <Box textAlign="center" py={8}>
        <Typography variant="h2" color="primary" gutterBottom>Qlicker</Typography>
        <Typography variant="h5" color="text.secondary" paragraph>
          Interactive classroom response system for higher education
        </Typography>
        <Button variant="contained" size="large" onClick={() => navigate('/login')} sx={{ mt: 2 }}>
          Get Started
        </Button>
      </Box>
    </Container>
  );
}
