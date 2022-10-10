import * as React from "react";
import { useReducer, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAlert } from "@showtime-xyz/universal.alert";
import { useRouter } from "@showtime-xyz/universal.router";

import { useMyInfo } from "app/hooks/api-hooks";
import { PROFILE_NFTS_QUERY_KEY } from "app/hooks/api-hooks";
import { useCreatorCollectionDetail } from "app/hooks/use-creator-collection-detail";
import { useCurrentUserAddress } from "app/hooks/use-current-user-address";
import { useMatchMutate } from "app/hooks/use-match-mutate";
import { useSignTypedData } from "app/hooks/use-sign-typed-data";
import { useWallet } from "app/hooks/use-wallet";
import { axios } from "app/lib/axios";
import { Logger } from "app/lib/logger";
import { useRudder } from "app/lib/rudderstack";
import { captureException } from "app/lib/sentry";
import { IEdition } from "app/types";
import { ledgerWalletHack } from "app/utilities";
import { delay } from "app/utilities";

type State = {
  status: "idle" | "loading" | "success" | "error";
  error?: string;
  transactionHash?: string;
  mint?: any;
  signaturePrompt?: boolean;
};

type Action = {
  error?: string;
  type: string;
  transactionHash?: string;
  mint?: any;
};

type ContextType = {
  state: State;
  setEdition: (edition: IEdition) => void;
  claimNFT: () => Promise<boolean | undefined>;
  onReconnectWallet: any;
  resetState: () => void;
};

const ClaimContext = React.createContext(null as unknown as ContextType);

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "loading":
      return { ...initialState, status: "loading" };
    case "success":
      return {
        ...state,
        status: "success",
        mint: action.mint,
      };
    case "transactionHash":
      return {
        ...state,
        transactionHash: action.transactionHash,
      };
    case "reset": {
      return initialState;
    }
    case "signaturePrompt": {
      return {
        ...state,
        signaturePrompt: true,
      };
    }
    case "signatureSuccess": {
      return {
        ...state,
        signaturePrompt: false,
      };
    }
    case "error":
      return {
        ...state,
        status: "error",
        signaturePrompt: false,
        error: action.error,
      };
    default:
      return state;
  }
};

const initialState: State = {
  status: "idle",
  signaturePrompt: false,
};

export const ClaimProvider = (props: any) => {
  const { rudder } = useRudder();
  const router = useRouter();
  const { data: userProfile } = useMyInfo();
  const [edition, setEdition] = React.useState<IEdition | null>(null);

  const signTypedData = useSignTypedData();
  const [state, dispatch] = useReducer(reducer, initialState);
  const mutate = useMatchMutate();
  const Alert = useAlert();
  const { mutate: mutateEdition } = useCreatorCollectionDetail(
    edition?.contract_address
  );
  const { connect } = useWallet();

  let { userAddress } = useCurrentUserAddress();

  const pollTransaction = async (transactionId: any) => {
    let intervalMs = 2000;
    for (let attempts = 0; attempts < 100; attempts++) {
      Logger.log(`Checking tx... (${attempts + 1} / 20)`);
      const response = await axios({
        url: `/v1/creator-airdrops/poll-mint?relayed_transaction_id=${transactionId}`,
        method: "GET",
      });
      Logger.log(response);

      dispatch({
        type: "transactionHash",
        transactionHash: response.transaction_hash,
      });

      if (response.is_complete) {
        rudder?.track("NFT Claimed");
        dispatch({ type: "success", mint: response.mint });
        mutate((key) => key.includes(PROFILE_NFTS_QUERY_KEY));
        mutateEdition((d) => {
          if (d) {
            return {
              ...d,
              is_already_claimed: true,
              total_claimed_count: d?.total_claimed_count + 1,
            };
          }
        });

        return;
      }

      await delay(intervalMs);
    }

    dispatch({ type: "error", error: "polling timed out" });
  };

  const signTransaction = async ({ forwardRequest }: any) => {
    dispatch({ type: "signaturePrompt" });

    const signature = await signTypedData(
      forwardRequest.domain,
      forwardRequest.types,
      forwardRequest.value
    );

    dispatch({ type: "signatureSuccess" });

    const newSignature = ledgerWalletHack(signature);
    Logger.log("Signature", { signature, newSignature });
    Logger.log("Submitting tx...");

    const relayedTx = await axios({
      url: `/v1/relayer/forward-request`,
      method: "POST",
      data: {
        forward_request: forwardRequest,
        signature: newSignature,
        from_address: userAddress,
      },
    });

    await pollTransaction(relayedTx.relayed_transaction_id);
  };

  const forwarderRequestCached = useRef<any>();

  useEffect(() => {
    let timeout: any;
    async function initialiseForwardRequest() {
      if (edition?.minter_address && userAddress && !edition.is_gated) {
        forwarderRequestCached.current = await getForwarderRequest({
          userAddress,
          minterAddress: edition?.minter_address,
        });
      }

      // clear cached forwarderRequest because nonce might have changed!
      timeout = setTimeout(() => {
        forwarderRequestCached.current = null;
      }, 20000);
    }
    initialiseForwardRequest();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [edition?.minter_address, userAddress, edition?.is_gated]);

  const claimNFT = async (): Promise<boolean | undefined> => {
    try {
      if (edition?.minter_address) {
        dispatch({ type: "loading" });

        if (edition?.is_gated) {
          await gatedClaimFlow();
        } else {
          await oldSignaureClaimFlow();
        }
        return true;
      }
    } catch (e: any) {
      dispatch({ type: "error", error: e?.message });
      forwarderRequestCached.current = null;
      Logger.error("nft drop claim failed", e);

      if (e?.response?.status === 420) {
        // Verified users have claim limit to 10 and users that have phone verified also have claim limit to 10.
        // So increasing claim limit alert makes sense only when you're not verified and you've not verified your phone
        if (
          !userProfile?.data.profile.has_verified_phone_number &&
          !userProfile?.data.profile.verified
        ) {
          Alert.alert(
            "Wow, you love claiming drops!",
            "Prove you're a real person and we'll let you claim more. Please verify your phone number.",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Verify my phone number",
                onPress: () => {
                  rudder?.track("Button Clicked", {
                    name: "Verify my phone number",
                  });

                  router.push(
                    Platform.select({
                      native: `/settings/verify-phone-number`,
                      web: {
                        pathname: router.pathname,
                        query: {
                          ...router.query,
                          verifyPhoneNumberModal: true,
                        },
                      } as any,
                    }),
                    Platform.select({
                      native: `/settings/verify-phone-number`,
                      web: router.asPath,
                    }),
                    { scroll: false }
                  );
                },
              },
            ]
          );
        } else {
          Alert.alert(
            "Wow, you love claiming drops!",
            `Only ${userProfile?.data.daily_claim_limit} claims per day is allowed. Come back tomorrow!`
          );
        }
      }

      if (e?.response?.status === 500) {
        Alert.alert(
          "Oops. An error occured.",
          "We are currently experiencing a lot of usage. Please try again in one hour!"
        );
      }

      captureException(e);
    }
  };

  const gatedClaimFlow = async () => {
    if (edition?.minter_address) {
      const relayerResponse = await axios({
        url:
          "/v1/creator-airdrops/mint-gated-edition/" + edition.contract_address,
        method: "POST",
        data: {},
      });

      await pollTransaction(relayerResponse.relayed_transaction_id);
    }
  };

  const oldSignaureClaimFlow = async () => {
    if (!userAddress) {
      // user is probably not connected to wallet
      const session = await connect?.();
      userAddress = session?.address;
    }

    if (edition?.minter_address && userAddress) {
      let forwardRequest: any;
      if (forwarderRequestCached.current) {
        forwardRequest = forwarderRequestCached.current;
      } else {
        forwardRequest = await getForwarderRequest({
          minterAddress: edition?.minter_address,
          userAddress,
        });
      }

      Logger.log("Signing... ", forwardRequest);

      await signTransaction({ forwardRequest });
    }
  };

  const onReconnectWallet = React.useCallback(() => {
    dispatch({
      type: "error",
      error: "Please retry claiming the drop",
    });
  }, []);

  const resetState = React.useCallback(() => {
    dispatch({
      type: "reset",
    });
  }, []);

  return (
    <ClaimContext.Provider
      value={{ setEdition, claimNFT, state, resetState, onReconnectWallet }}
    >
      {props.children}
    </ClaimContext.Provider>
  );
};

const minterABI = ["function mintEdition(address _to)"];

const getForwarderRequest = async ({
  minterAddress,
  userAddress,
}: {
  minterAddress: string;
  userAddress: string;
}) => {
  const Interface = (await import("@ethersproject/abi")).Interface;
  const targetInterface = new Interface(minterABI);
  const callData = targetInterface.encodeFunctionData("mintEdition", [
    userAddress,
  ]);
  const res = await axios({
    url: `/v1/relayer/forward-request?call_data=${encodeURIComponent(
      callData
    )}&to_address=${encodeURIComponent(
      minterAddress
    )}&from_address=${encodeURIComponent(userAddress)}`,
    method: "GET",
  });

  return res;
};

export const useClaimNFT = (edition?: IEdition) => {
  const { state, claimNFT, onReconnectWallet, setEdition, resetState } =
    React.useContext(ClaimContext);
  useEffect(() => {
    if (edition) {
      setEdition(edition);
    }
  }, [edition, setEdition]);

  // Logger.log("useClaimNFT", state);

  return {
    state,
    claimNFT,
    onReconnectWallet,
    resetState,
  };
};