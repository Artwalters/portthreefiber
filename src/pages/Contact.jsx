import React from 'react'

export default function Contact({ onBack }) {
    return (
        <div className="contact-page">
            {/* Header */}
            <header className="contact-header">
                <div className="contact-back" onClick={onBack}>
                    Back <span className="contact-arrow">←</span>
                </div>
                <div className="contact-sun">✺</div>
            </header>

            {/* Top Section - About */}
            <section className="contact-about">
                <p className="contact-intro">
                    Walters.inc is a multidisciplinary design studio founded by twins.
                    <br />
                    Two perspectives merged. One output.
                </p>
                <div className="contact-year">
                    <span>2026</span>
                    <span>®</span>
                </div>
                <p className="contact-description">
                    Our studio unites four approaches: graphic design, web development, motion, and 3D CGI. We explore every project through typography, movement, and edge. Driven by our passion for design, culture, and sports.
                </p>
                <p className="contact-skills">
                    Skills: Brand Identity, Art Direction, Typography, Web Design & Development, 3D Visualization, Motion, Video.
                </p>
            </section>

            {/* Bottom Section - Contact Info */}
            <section className="contact-info">
                <h2 className="contact-title">WALTERS.INC</h2>
                <p className="contact-inquiry-text">
                    For project inquiries, collaborations, and general
                    <br />
                    questions. Please include a brief project
                    <br />
                    description, timeline, and budget range.
                </p>

                <div className="contact-dragon">
                    <img
                        src="./img/logo/walters_logo_dragon.svg"
                        alt="Walters Dragon Logo"
                        className="contact-dragon-img"
                    />
                    <span className="contact-dragon-r">®</span>
                </div>

                <div className="contact-names">
                    <span>Arthur Walters</span>
                    <span>Quentin Walters</span>
                </div>

                <a href="mailto:hello@walters.studio" className="contact-cta">
                    [Begin Your Inquiry]
                </a>

                <div className="contact-links">
                    <p>Mail: hello@walters.studio</p>
                    <p>Instagram: @walters.inc</p>
                </div>
            </section>

            {/* Footer */}
            <footer className="contact-footer">
                <img
                    src="./img/logo/walters_logo.svg"
                    alt="Walters Studio"
                    className="contact-footer-logo"
                />
                <span className="contact-footer-rights">All Rights Reserved ©</span>
            </footer>
        </div>
    )
}
