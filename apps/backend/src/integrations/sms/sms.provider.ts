export interface SmsProvider {
  sendOtp(to: string, code: string): Promise<void>;
  send(to: string, message: string): Promise<void>;
}

export class TwilioProvider implements SmsProvider {
  async sendOtp(to: string, code: string) {
    console.log(`[Twilio Mock] Sending OTP ${code} to ${to}`);
  }
  async send(to: string, message: string) {
    console.log(`[Twilio Mock] Sending SMS to ${to}: ${message}`);
  }
}

export function createSmsProvider(): SmsProvider {
  return new TwilioProvider();
}
