import nodemailer from "nodemailer";

export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: true, 
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendEmail(to: string, subject: string, text: string, html?: string) {
    try {
      const info = await this.transporter.sendMail({
        from: `"The Rev" <${process.env.SMTP_FROM}>`,
        to,
        subject,
        text,
        html, 
      });

      console.log("Email sent:", info.messageId);
      return info;
    } catch (err) {
      console.error("Email sending error:", err);
      throw new Error("Could not send email");
    }
  }

  async sendWelcomeEmail(email: string, userName: string) {
  const text = `Welcome to The Rev, ${userName}! Your account was created successfully.`;

  const html = `
    <h2>Welcome to The Rev, no man can separate what we create, ${userName}!</h2>
    <p>Your account was created successfully.</p>
  `;

  return this.sendEmail(email, "Welcome!", text, html);
}


  async sendPasswordResetEmail(email: string, resetLink: string) {
    const html = `
      <h2>Password Reset Request</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetLink}">Reset Password</a>
    `;

    return this.sendEmail(email, "Password Reset", html);
  }
}
