import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingPage from './LandingPage';

vi.mock('./config/ConfigProvider', () => ({
  useConfig: () => ({ VISION_FRONT_URL: 'http://vision.test' }),
}));
vi.mock('./ContactForm', () => ({ default: () => <div>contact-form</div> }));

const setLocationHref = () => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, href: '' },
    writable: true,
  });
};

beforeEach(() => {
  vi.restoreAllMocks();
  setLocationHref();
});

describe('LandingPage', () => {
  it('renders the main sections', () => {
    render(<LandingPage />);

    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    expect(screen.getByText('Free & Open Source')).toBeInTheDocument();
    expect(screen.getByText('contact-form')).toBeInTheDocument();
  });

  it('links "Get Started" and the hero CTA to the configured Vision URL', () => {
    render(<LandingPage />);

    const getStarted = screen.getByRole('link', { name: 'Get Started' });
    expect(getStarted).toHaveAttribute('href', 'http://vision.test');
  });

  it('toggles the mobile nav menu open and closed', () => {
    render(<LandingPage />);

    const nav = document.querySelector('.nav ul')!;
    expect(nav.className).not.toContain('open');

    fireEvent.click(screen.getByRole('button', { name: '☰' }));
    expect(nav.className).toContain('open');

    fireEvent.click(screen.getByRole('button', { name: '☰' }));
    expect(nav.className).not.toContain('open');
  });

  it('closes the menu when a nav link is clicked', () => {
    render(<LandingPage />);
    const nav = document.querySelector('.nav ul')!;
    fireEvent.click(screen.getByRole('button', { name: '☰' }));
    expect(nav.className).toContain('open');

    fireEvent.click(screen.getByRole('link', { name: 'Home' }));

    expect(nav.className).not.toContain('open');
  });

  it('closes the menu when the Features or Open Source nav links are clicked', () => {
    render(<LandingPage />);
    const nav = document.querySelector('.nav ul')!;

    fireEvent.click(screen.getByRole('button', { name: '☰' }));
    fireEvent.click(screen.getAllByRole('link', { name: 'Features' })[0]);
    expect(nav.className).not.toContain('open');

    fireEvent.click(screen.getByRole('button', { name: '☰' }));
    fireEvent.click(screen.getAllByRole('link', { name: 'Open Source' })[0]);
    expect(nav.className).not.toContain('open');
  });

  it('smooth-scrolls to the contact section from the nav link', () => {
    render(<LandingPage />);
    const contactSection = document.getElementById('contact')!;
    const scrollIntoView = vi.fn();
    contactSection.scrollIntoView = scrollIntoView;

    const navContactLink = screen.getAllByRole('link', { name: 'Contact' })[0];
    fireEvent.click(navContactLink);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('smooth-scrolls to the contact section from the footer link', () => {
    render(<LandingPage />);
    const contactSection = document.getElementById('contact')!;
    const scrollIntoView = vi.fn();
    contactSection.scrollIntoView = scrollIntoView;

    const footerContactLink = screen.getAllByRole('link', { name: 'Contact' }).at(-1)!;
    fireEvent.click(footerContactLink);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('navigates to the app URL when "Start Building" is clicked', () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Building' }));

    expect(window.location.href).toBe('http://vision.test');
  });

  it('navigates to the app URL when "Start Your Project" is clicked', () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Your Project' }));

    expect(window.location.href).toBe('http://vision.test');
  });

  it('opens GitHub in a new tab when "View on GitHub" is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'View on GitHub' }));

    expect(openSpy).toHaveBeenCalledWith('https://github.com/visin-platform', '_blank');
  });

  it('links the GitHub icon to the org page', () => {
    render(<LandingPage />);

    const githubLink = screen.getByTitle('View on GitHub');
    expect(githubLink).toHaveAttribute('href', 'https://github.com/visin-platform');
  });
});
