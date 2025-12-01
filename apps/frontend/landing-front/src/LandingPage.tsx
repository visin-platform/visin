import { useState } from 'react';
import './LandingPage.css';
import { useConfig } from './config/ConfigProvider';

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const config = useConfig();
  const appUrl = config.APP_URL || '#';

  return (
    <div className="App">
      <header className="header">
        <div className="logo">
          <img src="/logo.svg" alt="Visin Logo" />
          <span>Visin</span>
        </div>
        <nav className="nav">
          <ul className={menuOpen ? 'open' : ''}>
            <li><a href="#home" onClick={() => setMenuOpen(false)}>Home</a></li>
            <li><a href="#features" onClick={() => setMenuOpen(false)}>Features</a></li>
            <li><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a></li>
            <li><a href={appUrl} className="nav-cta">Get Started</a></li>
          </ul>
        </nav>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </header>
      <section id="home" className="hero">
        <div className="hero-content">
          <h1>Visual Intelligence Platform</h1>
          <p>
            Accelerate your computer vision lifecycle with VisIn. From dataset curation and model training to advanced benchmarking and visualization, we provide the tools you need to build state-of-the-art vision systems.
          </p>
          <div className="hero-actions">
            <button className="cta-button" onClick={() => window.location.href = appUrl}>Get Started</button>
            <button className="cta-button outline">View Documentation</button>
          </div>
        </div>
      </section>
      <section id="features" className="features">
        <h2>Features</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1633412802994-5c058f151b66?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Dataset Management</h3>
              <p>Curate, label, and categorize your image datasets. Manage image categories and streamline your data preparation workflow with advanced tools.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Model Training</h3>
              <p>Configure and monitor training sessions. Track epochs, manage configurations, and visualize training progress in real-time.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Benchmarking</h3>
              <p>Run comprehensive benchmarks. Compare model performance against industry standards and track improvements over time.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Comparisons</h3>
              <p>Side-by-side comparisons for datasets, training runs, test results, and visualizations to identify the best performing models.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Analysis & Visualization</h3>
              <p>Deep dive into your data with advanced analysis tools and interactive visualizations for epochs and training metrics.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Test Results</h3>
              <p>Detailed test result reporting and validation. Ensure your models meet accuracy and reliability requirements before deployment.</p>
            </div>
          </div>
        </div>
      </section>
      <section id="pricing" className="pricing">
        <h2>Simple, Transparent Pricing</h2>
        <div className="pricing-grid">
          <div className="pricing-card featured">
            <div className="pricing-header">
              <h3>Community</h3>
              <div className="price">$0<span>/month</span></div>
              <p>Perfect for researchers and open source projects</p>
            </div>
            <ul className="pricing-features">
              <li>✓ Unlimited Public Projects</li>
              <li>✓ 5GB Storage</li>
              <li>✓ Community Support</li>
              <li>✓ Standard Training Queue</li>
            </ul>
            <button className="cta-button full-width" onClick={() => window.location.href = appUrl}>Get Started Free</button>
          </div>
          <div className="pricing-card disabled">
            <div className="pricing-header">
              <h3>Pro</h3>
              <div className="price">Coming Soon</div>
              <p>For teams requiring advanced capabilities</p>
            </div>
            <ul className="pricing-features">
              <li>✓ Private Projects</li>
              <li>✓ 100GB Storage</li>
              <li>✓ Priority Support</li>
              <li>✓ Dedicated GPU Access</li>
            </ul>
            <button className="cta-button outline full-width" disabled>Join Waitlist</button>
          </div>
        </div>
      </section>
      <section id="get-started" className="cta-section">
        <div className="cta-content">
          <h2>Accelerate Your Vision Projects</h2>
          <p>Join researchers and developers using VisIn to streamline their computer vision workflows.</p>
          <button className="cta-button secondary" onClick={() => window.location.href = appUrl}>Start Now</button>
        </div>
      </section>
      <footer className="footer">
        <p>&copy; 2025 VisIn. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default LandingPage;