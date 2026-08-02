import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { Send } from '@mui/icons-material';
import { useConfig } from './config/ConfigProvider';

interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

const EMPTY_FORM: ContactFormData = { name: '', email: '', message: '' };

const ContactForm: React.FC = () => {
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const config = useConfig();
  const apiBaseUrl = config.VISION_API_URL || 'http://localhost:4010';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSubmitStatus('success');
        setFormData(EMPTY_FORM);
      } else {
        setSubmitStatus('error');
        setErrorMessage(data.message || 'Failed to submit form');
      }
    } catch {
      setSubmitStatus('error');
      setErrorMessage('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 3, borderColor: 'divider' }}>
      {submitStatus === 'success' ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h5" sx={{ mb: 1 }}>
            Thank you
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            Your message has been sent. We&apos;ll get back to you by email.
          </Typography>
        </Box>
      ) : (
        <Box component="form" onSubmit={handleSubmit} noValidate={false}>
          <Stack spacing={2.5}>
            <TextField
              id="name"
              name="name"
              label="Name"
              value={formData.name}
              onChange={handleInputChange}
              required
              fullWidth
              autoComplete="name"
            />
            <TextField
              id="email"
              name="email"
              type="email"
              label="Email"
              value={formData.email}
              onChange={handleInputChange}
              required
              fullWidth
              autoComplete="email"
            />
            <TextField
              id="message"
              name="message"
              label="Message"
              value={formData.message}
              onChange={handleInputChange}
              required
              fullWidth
              multiline
              rows={5}
            />

            {submitStatus === 'error' && <Alert severity="error">{errorMessage}</Alert>}

            <Box>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting}
                endIcon={<Send />}
                sx={{ borderRadius: 2 }}
              >
                {isSubmitting ? 'Sending…' : 'Send message'}
              </Button>
            </Box>
          </Stack>
        </Box>
      )}
    </Paper>
  );
};

export default ContactForm;
