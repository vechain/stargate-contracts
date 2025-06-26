import { Card, CardBody, HStack, Text } from "@chakra-ui/react";
import { useAccountBalance } from "@vechain/vechain-kit";

const formatBalance = (balance: string) => {
  return Number(balance).toFixed(2);
};

export const BalanceCard = () => {
  const { data } = useAccountBalance();
  return (
    <Card>
      <CardBody>
        <HStack justify="space-between">
          <Text fontSize="lg" fontWeight="bold">
            Balance
          </Text>
          <HStack>
            <Text fontSize="2xl" fontWeight="bold">
              {formatBalance(data?.balance || "0")} VET
            </Text>
          </HStack>
        </HStack>
      </CardBody>
    </Card>
  );
};
