import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UsersDao } from '../dao/users.dao';
import { User } from '../entities/User';
import { EmailService } from '../services/Emailservice';
import {
  CreateUserInput,
  EditUserInput,
  GetUserInput,
  returnedUser,
} from '../resolvers/User';
import { Constants } from '../utils/constants';

const PASSWORD_HASH_ROUNDS = 10;
const JWT_EXPIRATION = '2h';
const RESET_TOKEN_EXPIRATION = '20m';

export class UsersModel {
  private readonly dao: UsersDao;
  private readonly emailService: EmailService;
  private forgotPasswordLink: string;

  constructor() {
    this.dao = new UsersDao();
    this.emailService = new EmailService();

    if (process.env.NODE_ENV === 'test') {
      this.forgotPasswordLink = Constants.qaUrl;
    } else if (process.env.NODE_ENV === 'development') {
      this.forgotPasswordLink = Constants.localUrl;
    } else {
      this.forgotPasswordLink = Constants.prodUrl;
    }
    this.forgotPasswordLink += 'reset_password';
  }

  async getAllUsers(): Promise<User[]> {
    return this.dao.findAll();
  }

  async getUser(data: {
    id?: string;
    userName?: string;
    email?: string;
  }): Promise<returnedUser | null> {
    const { id, userName, email } = data;

    if (!id && !userName && !email) {
      throw new Error('Please provide id, userName, or email');
    }

    let user: User | null = null;

    if (email) {
      user = await this.dao.findByEmail(email);
    } else if (id) {
      user = await this.dao.findById(id);
    } else if (userName) {
      user = await this.dao.findByUsername(userName);
    }

    if (!user) return null;

    return {
      id: user.id,
      userName: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      bio: user.bio,
      ideology: user.ideology,
      profilePicUrl: user.profilePicUrl,
      password: user.password,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      jwt: '',
    };
  }

  async registerUser(input: CreateUserInput): Promise<returnedUser> {
    const existing = await this.dao.findByEmail(input.email);
    if (existing) throw new Error('Email is already in use');

    const hashedPassword = await bcrypt.hash(
      input.password,
      PASSWORD_HASH_ROUNDS
    );

    const newUser = await this.dao.create({
      userName: input.userName,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      password: hashedPassword,
      bio: input.bio,
      ideology: input.ideology,
    });

    await this.emailService.sendWelcomeEmail(newUser.email, newUser.userName);

    return {
      id: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      userName: newUser.userName,
      email: newUser.email,
      bio: newUser.bio,
      ideology: newUser.ideology,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };
  }

  async verifyUser(
    identifier: { userName?: string; email?: string },
    password: string
  ): Promise<returnedUser> {
    const user = await this.getUser(identifier);
    if (!user || !user.password) throw new Error('Invalid user or password');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error('Incorrect password');

    user.jwt = jwt.sign(
      {
        userId: user.id,
        userName: user.userName,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: JWT_EXPIRATION }
    );

    delete user.password; // never expose password
    return user;
  }

  async forgotPassword(userName: string): Promise<string> {
    const user = await this.getUser({ userName });
    if (!user || !user.email) throw new Error('User has no email defined');

    const resetToken = jwt.sign(
      { userId: user.id, userName: user.userName, email: user.email },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: RESET_TOKEN_EXPIRATION }
    );

    const exiLoginLink = `${this.forgotPasswordLink}?resetToken=${resetToken}`;

    const subject = 'Restore your Rev password';
    const body = `Hello ${user.firstName || ''}, please reset your password using this link: ${exiLoginLink}`;
    const html = `<p>Hello ${user.firstName || ''},</p>
                  <p>Click <a href="${exiLoginLink}">here</a> to reset your password.</p>
                  <p>The link expires in 20 minutes.</p>`;

    await this.emailService.sendEmail(user.email, subject, body, html);

    return resetToken;
  }

  async resetPassword(
    userName: string,
    resetToken: string,
    newPassword: string
  ): Promise<string> {
    const decoded: any = jwt.verify(resetToken, process.env.JWT_SECRET_KEY!);
    if (decoded.userName !== userName) {
      throw new Error('Forbidden: user mismatch in password reset');
    }
    return this.savePassword(userName, newPassword);
  }

  async changePassword(
    userName: string,
    oldPassword: string,
    newPassword: string
  ): Promise<string> {
    await this.verifyUser({ userName }, oldPassword);

    if (oldPassword === newPassword) throw new Error('Passwords are unchanged');

    return this.savePassword(userName, newPassword);
  }

  private async savePassword(
    userName: string,
    password: string
  ): Promise<string> {
    const hashedPassword = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    await this.dao.saveUserPasswordByName(userName, hashedPassword);
    return `Password successfully saved for ${userName}`;
  }

  async editUser(id: string, data: EditUserInput): Promise<returnedUser> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, PASSWORD_HASH_ROUNDS);
    }
    const updated = await this.dao.updateUser(id, data);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.dao.deleteUser(id);
  }
}
