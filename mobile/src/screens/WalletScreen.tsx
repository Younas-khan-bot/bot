import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  type Product,
  type ProductPurchase,
} from 'react-native-iap';
import { apiClient, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { CoinPackage } from '../types';

// Must match the product IDs configured in Play Console AND in
// server/src/config/coinPackages.js.
const PRODUCT_IDS = ['coins_100', 'coins_550', 'coins_1200', 'coins_2600', 'coins_7000'];

export default function WalletScreen() {
  const { user, refreshUser } = useAuth();
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pkgRes] = await Promise.all([apiClient.get('/wallet/packages')]);
      setPackages(pkgRes.data.packages);
      await refreshUser();
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    let purchaseUpdateSub: { remove: () => void } | undefined;
    let purchaseErrorSub: { remove: () => void } | undefined;

    (async () => {
      try {
        await initConnection();
        const items = await getProducts({ skus: PRODUCT_IDS });
        setProducts(items);
      } catch (err) {
        console.warn('IAP init failed (expected in an emulator without Play Store)', err);
      }

      purchaseUpdateSub = purchaseUpdatedListener(async (purchase: ProductPurchase) => {
        try {
          const purchaseToken = purchase.purchaseToken;
          if (!purchaseToken) {
            return;
          }

          await apiClient.post('/wallet/purchase/verify', {
            productId: purchase.productId,
            purchaseToken,
          });

          await finishTransaction({ purchase, isConsumable: true });
          await refreshUser();
          setPurchasingId(null);
          Alert.alert('Success', 'Coins added to your wallet!');
        } catch (err) {
          setPurchasingId(null);
          Alert.alert('Purchase failed', apiErrorMessage(err, 'Could not verify purchase'));
        }
      });

      purchaseErrorSub = purchaseErrorListener((err) => {
        setPurchasingId(null);
        if (err.code !== 'E_USER_CANCELLED') {
          Alert.alert('Purchase error', err.message);
        }
      });
    })();

    load();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
      endConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (productId: string) => {
    setPurchasingId(productId);
    try {
      await requestPurchase({ skus: [productId] });
    } catch (err: any) {
      setPurchasingId(null);
      if (err.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase error', err.message ?? 'Could not start purchase');
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your balance</Text>
        <Text style={styles.balanceValue}>🪙 {user?.coinBalance ?? 0}</Text>
      </View>
      <FlatList
        data={packages}
        keyExtractor={(item) => item.productId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const storeProduct = products.find((p) => p.productId === item.productId);
          return (
            <TouchableOpacity
              style={styles.packageRow}
              disabled={purchasingId !== null}
              onPress={() => buy(item.productId)}>
              <View>
                <Text style={styles.packageLabel}>{item.label}</Text>
                {storeProduct && (
                  <Text style={styles.packagePrice}>{storeProduct.localizedPrice}</Text>
                )}
              </View>
              {purchasingId === item.productId ? (
                <ActivityIndicator color="#a78bfa" />
              ) : (
                <Text style={styles.buyText}>Buy</Text>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a' },
  balanceCard: {
    backgroundColor: '#1c1c2e',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  balanceLabel: { color: '#8b8b9a', fontSize: 14 },
  balanceValue: { color: '#fff', fontSize: 32, fontWeight: '700', marginTop: 6 },
  packageRow: {
    backgroundColor: '#1c1c2e',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  packageLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  packagePrice: { color: '#8b8b9a', marginTop: 4 },
  buyText: { color: '#a78bfa', fontWeight: '700', fontSize: 15 },
});
