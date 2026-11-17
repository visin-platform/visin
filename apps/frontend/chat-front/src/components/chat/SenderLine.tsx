import { Avatar, Link, Stack, Typography } from '@mui/material';

/** The name and picture that open a run of someone else's messages. */
export function SenderLine({
  name,
  profile
}: {
  name: string;
  profile?: { handle: string; picture?: string };
}) {
  const avatar = (
    <Avatar src={profile?.picture} alt="" sx={{ width: 22, height: 22, fontSize: '0.7rem' }}>
      {name.charAt(0)}
    </Avatar>
  );
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5, px: 0.5 }}>
      {profile ? (
        <Link href={`/u/${encodeURIComponent(profile.handle)}`} aria-label={`View ${name} profile`}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <Typography variant="caption" color="text.secondary">
        {name}
      </Typography>
    </Stack>
  );
}
