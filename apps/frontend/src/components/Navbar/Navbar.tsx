import { HStack, Heading } from "@chakra-ui/react";
import { WalletButton } from "@vechain/vechain-kit";

export const Navbar = () => {
  return (
    <HStack justify={"space-between"} p={2} borderBottom={"1px solid #EEEEEE"}>
      <Heading>Demo</Heading>
      <WalletButton
        mobileVariant="icon"
        desktopVariant="icon"
        buttonStyle={{
          borderRadius: "full",
          border: "1px solid #EEEEEE",
        }}
      />
    </HStack>
  );
};
