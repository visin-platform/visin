import { User } from '../../models/User';

describe('User model', () => {
  it('applies defaults for a new user', () => {
    const user = new User({ email: 'Test@Example.com', signupMethod: 'google' });

    expect(user.email).toBe('test@example.com'); // lowercased by the schema
    expect(user.roles).toEqual([]);
    expect(user.isApproved).toBe(true);
    expect(user.tokenVersion).toBe(1);
  });

  it('requires email and signupMethod', () => {
    const user = new User({});
    const error = user.validateSync();

    expect(error?.errors.email).toBeDefined();
    expect(error?.errors.signupMethod).toBeDefined();
  });

  it('trims name fields', () => {
    const user = new User({
      email: 'test@example.com',
      signupMethod: 'google',
      firstName: '  Test ',
      lastName: ' User  ',
    });

    expect(user.firstName).toBe('Test');
    expect(user.lastName).toBe('User');
  });
});
