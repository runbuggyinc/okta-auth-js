/*!
 * Copyright (c) 2015-present, Okta, Inc. and/or its affiliates. All rights reserved.
 * The Okta software accompanied by this notice is provided pursuant to the Apache License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * 
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { authenticate } from '../../../lib/idx/authenticate';
import { IdxStatus, AuthenticatorKey } from '../../../lib/idx/types';
import { IdxActions } from './../../../lib/idx/types/idx-js';

import {
  chainResponses,
  IdentifyResponseFactory,
  IdentifyWithPasswordResponseFactory,
  VerifyPasswordResponseFactory,
  IdxResponseFactory,
  PhoneAuthenticatorEnrollmentDataRemediationFactory,
  EnrollPhoneAuthenticatorRemediationFactory,
  EnrollGoogleAuthenticatorRemediationFactory,
  IdxErrorAccessDeniedFactory,
  IdxErrorIncorrectPassword,
  IdxErrorUserNotAssignedFactory,
  IdxErrorAuthenticationFailedFactory,
  RawIdxResponseFactory,
  IdxErrorNoAccountWithUsernameFactory,
  SelectAuthenticatorAuthenticateRemediationFactory,
  AuthenticatorValueFactory,
  PhoneAuthenticatorOptionFactory,
  EmailAuthenticatorOptionFactory,
  GoogleAuthenticatorOptionFactory,
  SelectAuthenticatorEnrollRemediationFactory,
  ChallengeAuthenticatorRemediationFactory,
  CredentialsValueFactory,
  PasscodeValueFactory,
  IdxErrorPasscodeInvalidFactory,
  IdxErrorEnrollmentInvalidPhoneFactory,
  IdxErrorGoogleAuthenticatorPasscodeInvalidFactory,
  PhoneAuthenticatorVerificationDataRemediationFactory,
  VerifyEmailRemediationFactory,
  VerifyGoogleAuthenticatorRemediationFactory
} from '@okta/test.support/idx';
import { IdxMessagesFactory } from '@okta/test.support/idx/factories/messages';

const mocked = {
  interact: require('../../../lib/idx/interact'),
  introspect: require('../../../lib/idx/introspect'),
};

describe('idx/authenticate', () => {
  let testContext;
  beforeEach(() => {
    const interactionCode = 'test-interactionCode';
    const stateHandle = 'test-stateHandle';
    const successResponse = IdxResponseFactory.build({
      interactionCode
    });

    const issuer = 'test-issuer';
    const clientId = 'test-clientId';
    const redirectUri = 'test-redirectUri';
    const transactionMeta = {
      issuer,
      clientId,
      redirectUri,
      state: 'meta-state',
      codeVerifier: 'meta-code',
      scopes: ['meta'],
      urls: { authorizeUrl: 'meta-authorizeUrl' },
      ignoreSignature: true,
      interactionHandle: 'meta-interactionHandle',
    };
    const tokenResponse = {
      tokens: {
        fakeToken: true
      }
    };
    const authClient = {
      options: {
        issuer,
        clientId,
        redirectUri
      },
      transactionManager: {
        exists: () => true,
        load: () => transactionMeta,
        clear: () => { },
        save: () => { },
        saveIdxResponse: () => { }
      },
      token: {
        exchangeCodeForTokens: () => Promise.resolve(tokenResponse)
      }
    };
    jest.spyOn(mocked.interact, 'interact').mockResolvedValue({
      meta: transactionMeta,
      interactionHandle: transactionMeta.interactionHandle,
      state: transactionMeta.state
    });

    jest.spyOn(authClient.token, 'exchangeCodeForTokens');

    testContext = {
      issuer,
      clientId,
      redirectUri,
      interactionCode,
      stateHandle,
      successResponse,
      tokenResponse,
      transactionMeta,
      authClient
    };
  });

  it('returns an auth transaction', async () => {
    const { authClient } = testContext;
    const identifyResponse = IdentifyResponseFactory.build();
    jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);
    const res = await authenticate(authClient, {});
    expect(res).toEqual({
      status: IdxStatus.PENDING,
      nextStep: {
        name: 'identify',
        inputs: [{
          name: 'username',
          label: 'Username'
        }]
      }
    });
  });

  describe('error handling', () => {

    describe('Profile enrollment is not enabled', () => {
      it('returns pending error "you do not have permission" when invalid username is provided', async () => {
        const { authClient } = testContext;
        const rawIdxState = RawIdxResponseFactory.build({
          messages: IdxMessagesFactory.build({
            value: [
              IdxErrorAccessDeniedFactory.build()
            ]
          })
        });
        const identifyResponse = IdentifyResponseFactory.build();
        const errorResponse = Object.assign({}, identifyResponse, { rawIdxState });
        identifyResponse.proceed = jest.fn().mockResolvedValueOnce(errorResponse);
        jest.spyOn(mocked.introspect, 'introspect').mockResolvedValueOnce(identifyResponse);

        const res = await authenticate(authClient, { username: 'obviously-wrong' });
        expect(res.status).toBe(IdxStatus.PENDING);
        expect(res.nextStep).toEqual({
          name: 'identify',
          inputs: [{
            name: 'username',
            label: 'Username'
          }]
        });
        expect(res.messages).toEqual([{
          class: 'ERROR',
          i18n: {
            key: 'security.access_denied'
          },
          message: 'You do not have permission to perform the requested action.'
        }]);
      });
    });

    describe('Profile enrollment is enabled', () => {
      it('returns pending error "No account with username" when invalid username is provided', async () => {
        const { authClient } = testContext;
        const username = 'obviously-wrong';
        const rawIdxState = RawIdxResponseFactory.build({
          messages: IdxMessagesFactory.build({
            value: [
              IdxErrorNoAccountWithUsernameFactory.build({}, {
                transient: { username }
              })
            ]
          })
        });
        const identifyResponse = IdentifyResponseFactory.build();
        const errorResponse = Object.assign({}, identifyResponse, { rawIdxState });
        identifyResponse.proceed = jest.fn().mockResolvedValueOnce(errorResponse);
        jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);

        const res = await authenticate(authClient, { username });
        expect(res.status).toBe(IdxStatus.PENDING);
        expect(res.nextStep).toEqual({
          name: 'identify',
          inputs: [{
            name: 'username',
            label: 'Username'
          }]
        });
        expect(res.messages).toEqual([{
          class: 'INFO',
          i18n: {
            key: 'idx.unknown.user',
            params: []
          },
          message: 'There is no account with the Username obviously-wrong.'
        }]);
      });
    });

    it('returns terminal error when invalid password is provided', async () => {
      const { authClient } = testContext;
      const errorResponse = RawIdxResponseFactory.build({
        messages: IdxMessagesFactory.build({
          value: [
            IdxErrorIncorrectPassword.build()
          ]
        })
      });

      const identifyResponse = IdentifyResponseFactory.build();
      identifyResponse.proceed = jest.fn().mockRejectedValue(errorResponse);
      jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);

      const res = await authenticate(authClient, { username: 'myuser', password: 'invalid-password' });
      expect(res.status).toBe(IdxStatus.TERMINAL);
      expect(res.messages).toEqual([{
        class: 'ERROR',
        i18n: {
          key: 'incorrectPassword'
        },
        message: 'Password is incorrect'
      }]);
    });

    it('returns terminal error when user account is deactivated or is not assigned to the application', async () => {
      const { authClient } = testContext;
      const errorResponse = RawIdxResponseFactory.build({
        messages: IdxMessagesFactory.build({
          value: [
            IdxErrorUserNotAssignedFactory.build()
          ]
        })
      });
      const identifyResponse = IdentifyResponseFactory.build();
      identifyResponse.proceed = jest.fn().mockRejectedValue(errorResponse);
      jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);

      const res = await authenticate(authClient, { username: 'myuser' });
      expect(res.status).toBe(IdxStatus.TERMINAL);
      expect(res.messages).toEqual([{
        class: 'ERROR',
        i18n: {
          key: undefined // this error does not have an i18n key
        },
        message: 'User is not assigned to this application'
      }]);
    });

    it('returns terminal error when user account is not assigned to the application and okta session exists', async () => {
      const { authClient } = testContext;
      const errorResponse = RawIdxResponseFactory.build({
        messages: IdxMessagesFactory.build({
          value: [
            IdxErrorUserNotAssignedFactory.build()
          ]
        })
      });
      const idxResponse = IdxResponseFactory.build({
        rawIdxState: errorResponse
      });
      jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(idxResponse);

      const res = await authenticate(authClient, {});
      expect(res.status).toBe(IdxStatus.TERMINAL);
      expect(res.messages).toEqual([{
        class: 'ERROR',
        i18n: {
          key: undefined // this error does not have an i18n key
        },
        message: 'User is not assigned to this application'
      }]);
    });

    it('returns terminal error when user account is locked or suspeneded', async () => {
      const { authClient } = testContext;
      const errorResponse = RawIdxResponseFactory.build({
        messages: IdxMessagesFactory.build({
          value: [
            IdxErrorAuthenticationFailedFactory.build()
          ]
        })
      });
      const identifyResponse = IdentifyResponseFactory.build();
      identifyResponse.proceed = jest.fn().mockRejectedValue(errorResponse);
      jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);

      const res = await authenticate(authClient, { username: 'myuser' });
      expect(res.status).toBe(IdxStatus.TERMINAL);
      expect(res.nextStep).toBe(undefined);
      expect(res.messages).toEqual([{
        class: 'ERROR',
        i18n: {
          key: 'errors.E0000004'
        },
        message: 'Authentication failed'
      }]);
    });

  });

  describe('basic authentication', () => {

    describe('identifier first', () => {
      beforeEach(() => {
        const { successResponse } = testContext;
        const verifyPasswordResponse = VerifyPasswordResponseFactory.build();
        const identifyResponse = IdentifyResponseFactory.build();
        chainResponses([
          identifyResponse,
          verifyPasswordResponse,
          successResponse
        ]);
        jest.spyOn(identifyResponse, 'proceed');
        jest.spyOn(verifyPasswordResponse, 'proceed');
        Object.assign(testContext, {
          identifyResponse,
          verifyPasswordResponse
        });
      });

      it('can authenticate, passing username and password up front', async () => {
        const { authClient, identifyResponse, verifyPasswordResponse, tokenResponse, interactionCode } = testContext;
        jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);
        const res = await authenticate(authClient, { username: 'fakeuser', password: 'fakepass' });
        expect(res).toEqual({
          status: IdxStatus.SUCCESS,
          tokens: tokenResponse.tokens,
        });
        expect(identifyResponse.proceed).toHaveBeenCalledWith('identify', { identifier: 'fakeuser' });
        expect(verifyPasswordResponse.proceed).toHaveBeenCalledWith('challenge-authenticator', { credentials: { passcode: 'fakepass' } });
        expect(authClient.token.exchangeCodeForTokens).toHaveBeenCalledWith({
          clientId: 'test-clientId',
          codeVerifier: 'meta-code',
          ignoreSignature: true,
          interactionCode,
          redirectUri: 'test-redirectUri',
          scopes: ['meta']
        }, {
          authorizeUrl: 'meta-authorizeUrl'
        });
      });

      it('can authenticate, passing username and password on demand', async () => {
        const { authClient, identifyResponse, verifyPasswordResponse, tokenResponse, interactionCode } = testContext;
        jest.spyOn(mocked.introspect, 'introspect')
          .mockResolvedValueOnce(identifyResponse)
          .mockResolvedValueOnce(identifyResponse)
          .mockResolvedValueOnce(verifyPasswordResponse);

        // First call: returns identify response
        let res = await authenticate(authClient, {});
        expect(res.status).toBe(IdxStatus.PENDING);
        expect(res.nextStep).toEqual({

          name: 'identify',
          inputs: [{
            name: 'username',
            label: 'Username'
          }]
        });

        // Second call: proceeds with identify response
        res = await authenticate(authClient, { username: 'myuser' });
        expect(identifyResponse.proceed).toHaveBeenCalledWith('identify', { identifier: 'myuser' });
        expect(res.status).toBe(IdxStatus.PENDING);
        expect(res.nextStep).toEqual({
          name: 'challenge-authenticator',
          type: 'password',
          authenticator: {
            displayName: 'Password',
            id: '8',
            key: 'okta_password',
            methods: [
              {
                type: 'password',
              },
            ],
            settings: {
              age: {
                historyCount: 4,
                minAgeMinutes: 0,
              },
              complexity: {
                excludeAttributes: [],
                excludeUsername: true,
                minLength: 8,
                minLowerCase: 0,
                minNumber: 0,
                minSymbol: 0,
                minUpperCase: 0,
              },
            },
            type: 'password',
          },
          inputs: [{
            name: 'password',
            label: 'Password',
            required: true,
            secret: true,
            type: 'string'
          }]
        });

        // Third call: proceeds with verify password
        res = await authenticate(authClient, { password: 'mypass' });
        expect(verifyPasswordResponse.proceed).toHaveBeenCalledWith('challenge-authenticator', { credentials: { passcode: 'mypass' } });
        expect(res).toEqual({
          'status': IdxStatus.SUCCESS,
          'tokens': tokenResponse.tokens,
        });
        expect(authClient.token.exchangeCodeForTokens).toHaveBeenCalledWith({
          clientId: 'test-clientId',
          codeVerifier: 'meta-code',
          ignoreSignature: true,
          interactionCode,
          redirectUri: 'test-redirectUri',
          scopes: ['meta']
        }, {
          authorizeUrl: 'meta-authorizeUrl'
        });
      });

    });

    describe('identifier with password', () => {
      beforeEach(() => {
        const { successResponse } = testContext;
        const identifyResponse = IdentifyWithPasswordResponseFactory.build();
        chainResponses([
          identifyResponse,
          successResponse
        ]);
        jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(identifyResponse);
        jest.spyOn(identifyResponse, 'proceed');
        Object.assign(testContext, {
          identifyResponse,
        });
      });

      it('can authenticate, passing username and password up front', async () => {
        const { authClient, identifyResponse, tokenResponse, interactionCode } = testContext;
        const res = await authenticate(authClient, { username: 'fakeuser', password: 'fakepass' });
        expect(res).toEqual({
          status: IdxStatus.SUCCESS,
          tokens: tokenResponse.tokens,
        });
        expect(identifyResponse.proceed).toHaveBeenCalledWith('identify', {
          identifier: 'fakeuser',
          credentials: {
            passcode: 'fakepass'
          }
        });
        expect(authClient.token.exchangeCodeForTokens).toHaveBeenCalledWith({
          clientId: 'test-clientId',
          codeVerifier: 'meta-code',
          ignoreSignature: true,
          interactionCode,
          redirectUri: 'test-redirectUri',
          scopes: ['meta']
        }, {
          authorizeUrl: 'meta-authorizeUrl'
        });
      });

      it('can authenticate, passing username and password on demand', async () => {
        const { authClient, identifyResponse, tokenResponse, interactionCode } = testContext;

        // First call: returns identify response
        let res = await authenticate(authClient, {});
        expect(res.status).toBe(IdxStatus.PENDING);
        expect(res.nextStep).toEqual({
          name: 'identify',
          inputs: [{
            name: 'username',
            label: 'Username'
          }, {
            name: 'password',
            label: 'Password',
            required: true,
            secret: true
          }]
        });

        // Second call: proceeds with identify response
        res = await authenticate(authClient, { username: 'myuser', password: 'mypass' });
        expect(identifyResponse.proceed).toHaveBeenCalledWith('identify', {
          identifier: 'myuser',
          credentials: {
            passcode: 'mypass'
          }
        });
        expect(res).toEqual({
          'status': IdxStatus.SUCCESS,
          'tokens': tokenResponse.tokens,
        });
        expect(authClient.token.exchangeCodeForTokens).toHaveBeenCalledWith({
          clientId: 'test-clientId',
          codeVerifier: 'meta-code',
          ignoreSignature: true,
          interactionCode,
          redirectUri: 'test-redirectUri',
          scopes: ['meta']
        }, {
          authorizeUrl: 'meta-authorizeUrl'
        });
      });

    });

  });

  describe('mfa authentication', () => {

    describe('phone', () => {


      describe('verification', () => {

        beforeEach(() => {
          const selectAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              SelectAuthenticatorAuthenticateRemediationFactory.build({
                value: [
                  AuthenticatorValueFactory.build({
                    options: [
                      PhoneAuthenticatorOptionFactory.build(),
                    ]
                  })
                ]
              })
            ]
          });
          const phoneVerificationDataResponse = IdxResponseFactory.build({
            neededToProceed: [
              PhoneAuthenticatorVerificationDataRemediationFactory.build()
            ]
          });

          const verifyPhoneResponse = IdxResponseFactory.build({
            actions: {
              'currentAuthenticatorEnrollment-resend': () => Promise.resolve(
                verifyPhoneResponse
              )
            } as IdxActions,
            neededToProceed: [
              EnrollPhoneAuthenticatorRemediationFactory.build()
            ]
          });
          const errorInvalidCodeResponse = RawIdxResponseFactory.build({
            remediation: {
              value: [
                ChallengeAuthenticatorRemediationFactory.build({
                  value: [
                    CredentialsValueFactory.build({
                      form: {
                        value: [
                          PasscodeValueFactory.build({
                            messages: IdxMessagesFactory.build({
                              value: [
                                IdxErrorPasscodeInvalidFactory.build()
                              ]
                            })
                          })
                        ]
                      }
                    })
                  ]
                })
              ]
            }
          });
          Object.assign(testContext, {
            selectAuthenticatorResponse,
            phoneVerificationDataResponse,
            verifyPhoneResponse,
            errorInvalidCodeResponse
          });
        });

        it('can auto-select the phone authenticator', async () => {
          const {
            authClient,
            selectAuthenticatorResponse,
            phoneVerificationDataResponse
          } = testContext;
          chainResponses([
            selectAuthenticatorResponse,
            phoneVerificationDataResponse
          ]);
          jest.spyOn(selectAuthenticatorResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(selectAuthenticatorResponse);
          const res = await authenticate(authClient, {
            authenticators: [AuthenticatorKey.PHONE_NUMBER] // will remediate select authenticator
          });
          expect(selectAuthenticatorResponse.proceed).toHaveBeenCalledWith('select-authenticator-authenticate', { authenticator: { id: 'id-phone' } });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            nextStep: {
              name: 'authenticator-verification-data',
              type: 'phone',
              authenticator: {
                displayName: 'Phone',
                id: '16',
                key: 'phone_number',
                methods: [
                  { type: 'sms' },
                  { type: 'voice' }
                ],
                type: 'phone',
              },
              inputs: [
                { name: 'methodType', type: 'string', required: true }
              ],
              options: [
                { label: 'SMS', value: 'sms' },
                { label: 'Voice call', value: 'voice' },
              ]
            }
          });
        });

        it('can verify phone authenticator using a code', async () => {
          const {
            authClient,
            verifyPhoneResponse,
            successResponse
          } = testContext;
          chainResponses([
            verifyPhoneResponse,
            successResponse
          ]);
          jest.spyOn(verifyPhoneResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyPhoneResponse);
          const verificationCode = 'test-code';
          const res = await authenticate(authClient, {
            verificationCode
          });
          expect(verifyPhoneResponse.proceed).toHaveBeenCalledWith('enroll-authenticator', {
            credentials: {
              passcode: 'test-code'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.SUCCESS,
            tokens: {
              fakeToken: true
            }
          });
        });

        it('can resend code for phone authenticator', async () => {
          const {
            authClient,
            verifyPhoneResponse,
          } = testContext;

          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyPhoneResponse);
          const res = await authenticate(authClient, {
            resend: true
          });
          expect(res.nextStep.canResend).toBe(true);
        });

        it('returns a PENDING error if an invalid code is provided', async () => {
          const {
            authClient,
            verifyPhoneResponse,
            errorInvalidCodeResponse
          } = testContext;
          jest.spyOn(verifyPhoneResponse, 'proceed').mockRejectedValue(errorInvalidCodeResponse);
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyPhoneResponse);
          const verificationCode = 'invalid-test-code';
          const res = await authenticate(authClient, {
            verificationCode
          });
          expect(verifyPhoneResponse.proceed).toHaveBeenCalledWith('enroll-authenticator', {
            credentials: {
              passcode: 'invalid-test-code'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            messages: [{
              class: 'ERROR',
              i18n: {
                key: 'api.authn.error.PASSCODE_INVALID',
                params: []
              },
              message: 'Invalid code. Try again.'
            }],
            nextStep: {
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }],
              name: 'enroll-authenticator',
              type: 'phone',
              authenticator: {
                displayName: 'Phone',
                id: '12',
                key: 'phone_number',
                methods: [
                  { type: 'sms' },
                  { type: 'voice' }
                ],
                type: 'phone',
              },
            }
          });
        });
      });

      describe('enrollment', () => {
        beforeEach(() => {
          const selectAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              SelectAuthenticatorEnrollRemediationFactory.build({
                value: [
                  AuthenticatorValueFactory.build({
                    options: [
                      PhoneAuthenticatorOptionFactory.build(),
                    ]
                  })
                ]
              })
            ]
          });
          const phoneEnrollmentDataResponse = IdxResponseFactory.build({
            neededToProceed: [
              PhoneAuthenticatorEnrollmentDataRemediationFactory.build()
            ]
          });
          const enrollPhoneResponse = IdxResponseFactory.build({
            neededToProceed: [
              EnrollPhoneAuthenticatorRemediationFactory.build()
            ]
          });
          const errorInvalidPhoneResponse = RawIdxResponseFactory.build({
            messages: IdxMessagesFactory.build({
              value: [
                IdxErrorEnrollmentInvalidPhoneFactory.build()
              ]
            }),
            remediation: {
              type: 'array',
              value: [
                SelectAuthenticatorEnrollRemediationFactory.build({
                  value: [
                    AuthenticatorValueFactory.build({
                      options: [
                        PhoneAuthenticatorOptionFactory.build(),
                      ]
                    })
                  ]
                })
              ]
            }
          });

          Object.assign(testContext, {
            selectAuthenticatorResponse,
            phoneEnrollmentDataResponse,
            enrollPhoneResponse,
            errorInvalidPhoneResponse
          });
        });

        it('can provide phoneNumber and methodType up front', async () => {
          const {
            authClient,
            selectAuthenticatorResponse,
            phoneEnrollmentDataResponse,
            enrollPhoneResponse
          } = testContext;

          chainResponses([
            selectAuthenticatorResponse,
            phoneEnrollmentDataResponse,
            enrollPhoneResponse
          ]);
          jest.spyOn(selectAuthenticatorResponse, 'proceed');
          jest.spyOn(phoneEnrollmentDataResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(selectAuthenticatorResponse);

          const res = await authenticate(authClient, {
            authenticators: [{
              key: AuthenticatorKey.PHONE_NUMBER,
              methodType: 'sms',
              phoneNumber: '(555) 555-5555',
            }]
          });
          expect(selectAuthenticatorResponse.proceed).toHaveBeenCalledWith('select-authenticator-enroll', {
            authenticator: {
              id: 'id-phone'
            }
          });
          expect(phoneEnrollmentDataResponse.proceed).toHaveBeenCalledWith('authenticator-enrollment-data', {
            authenticator: {
              id: 'id-phone',
              methodType: 'sms',
              phoneNumber: '(555) 555-5555'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            nextStep: {
              name: 'enroll-authenticator',
              type: 'phone',
              authenticator: {
                displayName: 'Phone',
                id: '12',
                key: 'phone_number',
                methods: [
                  { type: 'sms' },
                  { type: 'voice' }
                ],
                type: 'phone',
              },
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }]
            }
          });
        });

        it('can provide phoneNumber and methodType on demand', async () => {
          const {
            authClient,
            selectAuthenticatorResponse,
            phoneEnrollmentDataResponse,
            enrollPhoneResponse
          } = testContext;
          chainResponses([
            selectAuthenticatorResponse,
            phoneEnrollmentDataResponse,
            enrollPhoneResponse
          ]);
          jest.spyOn(selectAuthenticatorResponse, 'proceed');
          jest.spyOn(phoneEnrollmentDataResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect')
            .mockResolvedValueOnce(selectAuthenticatorResponse)
            .mockResolvedValueOnce(phoneEnrollmentDataResponse);

          let res = await authenticate(authClient, { authenticator: AuthenticatorKey.PHONE_NUMBER });
          expect(selectAuthenticatorResponse.proceed)
            .toHaveBeenCalledWith('select-authenticator-enroll', {
              authenticator: { id: 'id-phone' }
            });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            nextStep: {
              name: 'authenticator-enrollment-data',
              type: 'phone',
              authenticator: {
                displayName: 'Phone',
                id: '9',
                key: 'phone_number',
                methods: [
                  { type: 'sms' },
                  { type: 'voice' }
                ],
                type: 'phone',
              },
              inputs: [
                { name: 'methodType', type: 'string', required: true },
                { name: 'phoneNumber', type: 'string', required: true },
              ],
              options: [
                { label: 'SMS', value: 'sms' },
                { label: 'Voice call', value: 'voice' },
              ],
            }
          });

          res = await authenticate(authClient, {
            phoneNumber: '(555) 555-5555', methodType: 'sms'
          });
          expect(phoneEnrollmentDataResponse.proceed).toHaveBeenCalledWith('authenticator-enrollment-data', {
            authenticator: {
              id: 'id-phone',
              methodType: 'sms',
              phoneNumber: '(555) 555-5555'
            }
          });
          expect(res.status).toBe(IdxStatus.PENDING);
          expect(res.nextStep).toEqual({
            name: 'enroll-authenticator',
            type: 'phone',
            authenticator: {
              displayName: 'Phone',
              id: '12',
              key: 'phone_number',
              methods: [
                {
                  type: 'sms',
                },
                {
                  type: 'voice',
                },
              ],
              type: 'phone',
            },
            inputs: [{
              label: 'Enter code',
              name: 'verificationCode',
              required: true,
              type: 'string',
            }]
          });
        });

        it('returns a PENDING error if an invalid phone number was entered', async () => {
          const {
            authClient,
            phoneEnrollmentDataResponse,
            errorInvalidPhoneResponse
          } = testContext;

          jest.spyOn(phoneEnrollmentDataResponse, 'proceed').mockRejectedValue(errorInvalidPhoneResponse);
          jest.spyOn(mocked.introspect, 'introspect')
            .mockResolvedValueOnce(phoneEnrollmentDataResponse);

          const phoneNumber = 'obviously-not-valid';
          let res = await authenticate(authClient, { phoneNumber, methodType: 'sms' });
          expect(phoneEnrollmentDataResponse.proceed).toHaveBeenCalledWith('authenticator-enrollment-data', {
            authenticator: {
              id: 'id-phone',
              methodType: 'sms',
              phoneNumber
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            messages: [{
              class: 'ERROR',
              i18n: {
                key: undefined // this error does not have an i18n key
              },
              message: 'Invalid Phone Number.'
            }],
            nextStep: {
              name: 'authenticator-enrollment-data',
              type: 'phone',
              authenticator: {
                displayName: 'Phone',
                id: '9',
                key: 'phone_number',
                methods: [
                  { type: 'sms' },
                  { type: 'voice' }
                ],
                type: 'phone',
              },
              inputs: [
                { name: 'methodType', type: 'string', required: true },
                { name: 'phoneNumber', type: 'string', required: true },
              ],
              options: [
                { label: 'SMS', value: 'sms' },
                { label: 'Voice call', value: 'voice' }
              ],
            }
          });

        });
      });

    });

    describe('email', () => {

      describe('verification', () => {
        beforeEach(() => {
          const selectAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              SelectAuthenticatorAuthenticateRemediationFactory.build({
                value: [
                  AuthenticatorValueFactory.build({
                    options: [
                      EmailAuthenticatorOptionFactory.build(),
                    ]
                  })
                ]
              })
            ]
          });
          const verifyEmailResponse = IdxResponseFactory.build({
            neededToProceed: [
              VerifyEmailRemediationFactory.build()
            ]
          });
          const errorInvalidCodeResponse = RawIdxResponseFactory.build({
            remediation: {
              value: [
                ChallengeAuthenticatorRemediationFactory.build({
                  value: [
                    CredentialsValueFactory.build({
                      form: {
                        value: [
                          PasscodeValueFactory.build({
                            messages: IdxMessagesFactory.build({
                              value: [
                                IdxErrorPasscodeInvalidFactory.build()
                              ]
                            })
                          })
                        ]
                      }
                    })
                  ]
                })
              ]
            }
          });
          Object.assign(testContext, {
            selectAuthenticatorResponse,
            verifyEmailResponse,
            errorInvalidCodeResponse
          });
        });

        it('can verify email authenticator using a code', async () => {
          const {
            authClient,
            verifyEmailResponse,
            successResponse
          } = testContext;

          jest.spyOn(verifyEmailResponse, 'proceed').mockResolvedValue(successResponse);
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyEmailResponse);
          const verificationCode = 'test-code';
          const res = await authenticate(authClient, {
            verificationCode
          });
          expect(verifyEmailResponse.proceed).toHaveBeenCalledWith('challenge-authenticator', {
            credentials: {
              passcode: 'test-code'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.SUCCESS,
            tokens: {
              fakeToken: true
            }
          });
        });

        it('returns a PENDING error if an invalid code is provided', async () => {
          const {
            authClient,
            verifyEmailResponse,
            errorInvalidCodeResponse
          } = testContext;
          jest.spyOn(verifyEmailResponse, 'proceed').mockRejectedValue(errorInvalidCodeResponse);
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyEmailResponse);
          const verificationCode = 'invalid-test-code';
          const res = await authenticate(authClient, {
            verificationCode
          });
          expect(verifyEmailResponse.proceed).toHaveBeenCalledWith('challenge-authenticator', {
            credentials: {
              passcode: 'invalid-test-code'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            messages: [{
              class: 'ERROR',
              i18n: {
                key: 'api.authn.error.PASSCODE_INVALID',
                params: []
              },
              message: 'Invalid code. Try again.'
            }],
            nextStep: {
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }],
              name: 'challenge-authenticator',
              type: 'email',
              authenticator: {
                displayName: 'Email',
                id: '6',
                key: 'okta_email',
                methods: [
                  {
                    type: 'email',
                  },
                ],
                type: 'email',
              },
            }
          });
        });
      });

    });

    describe('google authenticator', () => {
      let errorInvalidCodeResponse;
      beforeEach(() => {
        errorInvalidCodeResponse = RawIdxResponseFactory.build({
          messages: IdxMessagesFactory.build({
            value: [
              IdxErrorGoogleAuthenticatorPasscodeInvalidFactory.build()
            ]
          }),
          remediation: {
            type: 'array',
            value: [
              SelectAuthenticatorEnrollRemediationFactory.build({
                value: [
                  AuthenticatorValueFactory.build({
                    options: [
                      PhoneAuthenticatorOptionFactory.build(),
                    ]
                  })
                ]
              })
            ]
          }
        });
      });

      describe('verification', () => {
        beforeEach(() => {
          const selectAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              SelectAuthenticatorAuthenticateRemediationFactory.build({
                value: [
                  AuthenticatorValueFactory.build({
                    options: [
                      GoogleAuthenticatorOptionFactory.build(),
                    ]
                  })
                ]
              })
            ]
          });
          const verifyAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              VerifyGoogleAuthenticatorRemediationFactory.build()
            ]
          });
          Object.assign(testContext, {
            selectAuthenticatorResponse,
            verifyAuthenticatorResponse,
            errorInvalidCodeResponse
          });
        });

        it('can auto-select the google authenticator', async () => {
          const {
            authClient,
            selectAuthenticatorResponse,
            verifyAuthenticatorResponse
          } = testContext;
          chainResponses([
            selectAuthenticatorResponse,
            verifyAuthenticatorResponse
          ]);
          jest.spyOn(selectAuthenticatorResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(selectAuthenticatorResponse);
          const res = await authenticate(authClient, {
            authenticator: AuthenticatorKey.GOOGLE_AUTHENTICATOR // will remediate select authenticator
          });
          expect(selectAuthenticatorResponse.proceed).toHaveBeenCalledWith('select-authenticator-authenticate', { 
            authenticator: { id: 'id-google-authenticator' } 
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            nextStep: {
              name: 'challenge-authenticator',
              type: 'app',
              authenticator: {
                displayName: 'Google Authenticator',
                id: '7',
                key: 'google_otp',
                methods: [
                  { type: 'otp' }
                ],
                type: 'app',
                contextualData: {
                  qrcode: {
                    href: 'data:image/png;base64,fake_encoding==',
                    method: 'embedded',
                    type: 'image/png',
                  },
                  sharedSecret: 'fake_secret',
                }
              },
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }]
            }
          });
        });

        it('can verify google authenticator using a code', async () => {
          const {
            authClient,
            verifyAuthenticatorResponse,
            successResponse
          } = testContext;
          chainResponses([
            verifyAuthenticatorResponse,
            successResponse
          ]);
          jest.spyOn(verifyAuthenticatorResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyAuthenticatorResponse);
          const verificationCode = 'test-code';
          const res = await authenticate(authClient, {
            verificationCode
          });
          expect(verifyAuthenticatorResponse.proceed).toHaveBeenCalledWith('challenge-authenticator', {
            credentials: {
              passcode: 'test-code'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.SUCCESS,
            tokens: {
              fakeToken: true
            }
          });
        });

        it('returns a PENDING error if an invalid code is provided', async () => {
          const {
            authClient,
            verifyAuthenticatorResponse,
            errorInvalidCodeResponse
          } = testContext;
          jest.spyOn(verifyAuthenticatorResponse, 'proceed').mockRejectedValue(errorInvalidCodeResponse);
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(verifyAuthenticatorResponse);
          const verificationCode = 'invalid-test-code';
          const res = await authenticate(authClient, {
            verificationCode
          });
          expect(verifyAuthenticatorResponse.proceed).toHaveBeenCalledWith('challenge-authenticator', {
            credentials: {
              passcode: 'invalid-test-code'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            messages: [{
              class: 'ERROR',
              i18n: {
                key: 'authfactor.challenge.soft_token.invalid_passcode'
              },
              message: 'Your code doesn\'t match our records. Please try again.'
            }],
            nextStep: {
              name: 'challenge-authenticator',
              type: 'app',
              authenticator: {
                displayName: 'Google Authenticator',
                id: '7',
                key: 'google_otp',
                methods: [
                  { type: 'otp' }
                ],
                type: 'app',
                contextualData: {
                  qrcode: {
                    href: 'data:image/png;base64,fake_encoding==',
                    method: 'embedded',
                    type: 'image/png',
                  },
                  sharedSecret: 'fake_secret',
                }
              },
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }]
            }
          });
        });
      });

      describe('enrollment', () => {
        beforeEach(() => {
          const selectAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              SelectAuthenticatorEnrollRemediationFactory.build({
                value: [
                  AuthenticatorValueFactory.build({
                    options: [
                      GoogleAuthenticatorOptionFactory.build(),
                    ]
                  })
                ]
              })
            ]
          });
          const enrollGoogleAuthenticatorResponse = IdxResponseFactory.build({
            neededToProceed: [
              EnrollGoogleAuthenticatorRemediationFactory.build()
            ]
          });

          Object.assign(testContext, {
            selectAuthenticatorResponse,
            enrollGoogleAuthenticatorResponse,
            errorInvalidCodeResponse
          });
        });

        it('can select google authenticator', async () => {
          const {
            authClient,
            selectAuthenticatorResponse,
            enrollGoogleAuthenticatorResponse
          } = testContext;

          chainResponses([
            selectAuthenticatorResponse,
            enrollGoogleAuthenticatorResponse
          ]);
          jest.spyOn(selectAuthenticatorResponse, 'proceed');
          jest.spyOn(enrollGoogleAuthenticatorResponse, 'proceed');
          jest.spyOn(mocked.introspect, 'introspect').mockResolvedValue(selectAuthenticatorResponse);

          const res = await authenticate(authClient, {
            authenticator: AuthenticatorKey.GOOGLE_AUTHENTICATOR
          });
          expect(selectAuthenticatorResponse.proceed).toHaveBeenCalledWith('select-authenticator-enroll', {
            authenticator: {
              id: 'id-google-authenticator'
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            nextStep: {
              name: 'enroll-authenticator',
              type: 'app',
              authenticator: {
                displayName: 'Google Authenticator',
                id: '13',
                key: 'google_otp',
                methods: [
                  { type: 'otp' }
                ],
                type: 'app',
                contextualData: {
                  qrcode: {
                    href: 'data:image/png;base64,fake_encoding==',
                    method: 'embedded',
                    type: 'image/png',
                  },
                  sharedSecret: 'fake_secret',
                }
              },
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }]
            }
          });
        });

        it('returns a PENDING error if an invalid code was entered', async () => {
          const {
            authClient,
            enrollGoogleAuthenticatorResponse,
            errorInvalidCodeResponse
          } = testContext;

          jest.spyOn(enrollGoogleAuthenticatorResponse, 'proceed').mockRejectedValue(errorInvalidCodeResponse);
          jest.spyOn(mocked.introspect, 'introspect')
            .mockResolvedValueOnce(enrollGoogleAuthenticatorResponse);

          const verificationCode = 'obviously-not-valid';
          let res = await authenticate(authClient, { verificationCode });
          expect(enrollGoogleAuthenticatorResponse.proceed).toHaveBeenCalledWith('enroll-authenticator', {
            credentials: {
              passcode: verificationCode
            }
          });
          expect(res).toEqual({
            status: IdxStatus.PENDING,
            messages: [{
              class: 'ERROR',
              i18n: {
                key: 'authfactor.challenge.soft_token.invalid_passcode'
              },
              message: 'Your code doesn\'t match our records. Please try again.'
            }],
            nextStep: {
              name: 'enroll-authenticator',
              type: 'app',
              authenticator: {
                displayName: 'Google Authenticator',
                id: '13',
                key: 'google_otp',
                methods: [
                  { type: 'otp' }
                ],
                type: 'app',
                contextualData: {
                  qrcode: {
                    href: 'data:image/png;base64,fake_encoding==',
                    method: 'embedded',
                    type: 'image/png',
                  },
                  sharedSecret: 'fake_secret',
                }
              },
              inputs: [{
                label: 'Enter code',
                name: 'verificationCode',
                required: true,
                type: 'string',
              }]
            }
          });

        });
      });

    });

  });
});