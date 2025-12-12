import { useState } from 'react';
import './LandingPage.css';
import { useConfig } from './config/ConfigProvider';
import ContactForm from './ContactForm';

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState('cloud');
  const [showContactForm, setShowContactForm] = useState(false);
  const config = useConfig();
  const appUrl = config.VISION_FRONT_URL || '#';

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
            <li><a href="#contact" onClick={(e) => { 
              e.preventDefault();
              setShowContactForm(true); 
              setMenuOpen(false);
              setTimeout(() => {
                const contactSection = document.getElementById('contact');
                if (contactSection) {
                  contactSection.scrollIntoView({ behavior: 'smooth' });
                }
              }, 100);
            }}>Contact</a></li>
            <li><a href={appUrl} className="nav-cta">Get Started</a></li>
          </ul>
        </nav>
        <a href="https://github.com/visin-platform" target="_blank" rel="noopener noreferrer" className="github-link" title="View on GitHub">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </header>
      <section id="home" className="hero">
        <div className="hero-content">
          <h1>Accelerate Your Computer Vision Projects</h1>
          <p>
            Transform your vision AI development with VisIn's comprehensive platform. From intelligent dataset management and automated model training to advanced benchmarking, project coordination, and cost optimization – streamline your entire computer vision workflow.
          </p>
          <div className="hero-badges">
            <span className="badge">Open Source</span>
            <span className="badge">Self-Hosted</span>
            <span className="badge">Cloud Ready</span>
          </div>
          <div className="hero-actions">
            <button className="cta-button" onClick={() => window.location.href = appUrl}>Start Building</button>
            <button className="cta-button outline" onClick={() => window.open('https://github.com/visin-platform', '_blank')}>View on GitHub</button>
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
          <div className="feature-card">
            <div className="feature-image" style={{backgroundImage: "url('https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop')"}}></div>
            <div className="feature-content">
              <h3>Project Management & Cost Tracking</h3>
              <p>Organize your vision projects with integrated task management, team collaboration tools, and comprehensive cost tracking. Monitor resource usage, budget allocation, and project timelines to optimize your AI development workflow.</p>
            </div>
          </div>
        </div>
      </section>
      <section id="pricing" className="pricing">
        <h2>Simple, Transparent Pricing</h2>
        <p className="pricing-subtitle">Start free and scale as you grow</p>
        
        <div className="deployment-toggle">
          <div className="deployment-options">
            <div className={`deployment-option ${deploymentMode === 'cloud' ? 'active' : ''}`} onClick={() => setDeploymentMode('cloud')}>
              <h3>Cloud Hosting</h3>
              <p>Managed infrastructure with automatic scaling</p>
            </div>
            <div className={`deployment-option ${deploymentMode === 'self-hosted' ? 'active' : ''}`} onClick={() => setDeploymentMode('self-hosted')}>
              <h3>Self-Hosted</h3>
              <p>Full control with on-premise deployment</p>
            </div>
          </div>
        </div>

        {deploymentMode === 'cloud' && (
          <div className="pricing-grid">
            <div className="pricing-card featured">
              <div className="pricing-header">
                <h3>Free</h3>
                <div className="price">€0<span>/month</span></div>
                <p>Perfect for getting started with computer vision</p>
              </div>
              <ul className="pricing-features">
                <li>✓ Unlimited Public Projects</li>
                <li>✓ 1GB Cloud Storage</li>
                <li>✓ Basic Analytics</li>
                <li>✓ Open Source Access</li>
              </ul>
              <button className="cta-button full-width" onClick={() => window.location.href = appUrl}>Get Started Free</button>
            </div>
            
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Enterprise</h3>
                <div className="price">Custom</div>
                <p>For organizations requiring advanced capabilities</p>
              </div>
              <ul className="pricing-features">
                <li>✓ Unlimited Private Projects</li>
                <li>✓ Priority Support</li>
                <li>✓ Dedicated GPU Access</li>
                <li>✓ Custom Integrations</li>
                <li>✓ Self-hosted Option</li>
              </ul>
              <button className="cta-button pricing-outline full-width" onClick={() => {
                setShowContactForm(true);
              }}>Contact</button>
            </div>
          </div>
        )}

        {deploymentMode === 'self-hosted' && (
          <div className="self-hosted-section">
            <h3>Self-Hosted: Free & Open Source</h3>
            <div className="self-hosted-content">
              <div className="self-hosted-features">
                <h4>Why Choose Self-Hosted?</h4>
                <ul>
                  <li>✓ <strong>Completely Free</strong> - No licensing fees</li>
                  <li>✓ Full data sovereignty and security</li>
                  <li>✓ Custom infrastructure optimization</li>
                  <li>✓ Compliance with enterprise policies</li>
                  <li>✓ No external data transfer</li>
                  <li>✓ White-label deployment options</li>
                  <li>✓ Open source codebase for full transparency</li>
                </ul>
              </div>
              <div className="self-hosted-opensource">
                <div className="open-source-note">
                  <p><strong>100% Open Source:</strong> Visin is fully open source on <a href="https://github.com/visin-platform" target="_blank" rel="noopener noreferrer">GitHub</a>. 
                  Deploy anywhere, contribute to development, or run locally at no cost.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
      <section id="get-started" className="cta-section">
        <div className="cta-content">
          <h2>Transform Your Vision AI Development</h2>
          <p>Join leading researchers and developers who trust VisIn to streamline their computer vision projects and accelerate innovation.</p>
          <button className="cta-button secondary" onClick={() => window.location.href = appUrl}>Start Your Project</button>
        </div>
      </section>

      {showContactForm && (
        <section id="contact" className="contact-section">
          <ContactForm />
        </section>
      )}

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-logo">
            <span>Visin</span>
            <p>Open source computer vision platform</p>
          </div>
          <div className="footer-links">
            <a href="https://github.com/visin-platform" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="#pricing">Pricing</a>
            <a href="#features">Features</a>
            <a href="#contact" onClick={(e) => {
              e.preventDefault();
              setShowContactForm(true);
              setTimeout(() => {
                const contactSection = document.getElementById('contact');
                if (contactSection) {
                  contactSection.scrollIntoView({ behavior: 'smooth' });
                }
              }, 100);
            }}>Contact</a>
          </div>
        </div>
        <p>&copy; 2025 Visin. Open source under MIT License.</p>
      </footer>
    </div>
  );
}

export default LandingPage;