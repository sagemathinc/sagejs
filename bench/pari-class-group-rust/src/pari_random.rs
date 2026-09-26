// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! PARI 2.17.4's 64-bit XORGEN4096 stream.
//!
//! Random relation collection is reproducible only when the random stream is
//! part of the algorithmic state.  This is a direct fixed-width translation
//! of `src/basemath/random.c`; wrapping is intentional and confined here.

const WEYL_INCREMENT: u64 = 7_046_029_254_386_353_131;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PariRandom {
    words: [u64; 64],
    weyl: u64,
    index: usize,
}

impl PariRandom {
    pub fn from_seed(seed: u64) -> Option<Self> {
        if seed == 0 {
            return None;
        }
        let mut value = seed;
        for _ in 0..64 {
            value = mix(value);
        }
        let mut weyl = value;
        let mut words = [0_u64; 64];
        for word in &mut words {
            value = mix(value);
            weyl = weyl.wrapping_add(WEYL_INCREMENT);
            *word = value.wrapping_add(weyl);
        }
        let mut answer = Self {
            words,
            weyl,
            index: 63,
        };
        for _ in 0..256 {
            answer.block();
        }
        Some(answer)
    }

    #[inline]
    fn block(&mut self) -> u64 {
        self.index = (self.index + 1) & 63;
        let mut left = self.words[self.index];
        let mut right = self.words[(self.index + 11) & 63];
        left ^= (left & 2_147_483_647) << 33;
        left ^= left >> 26;
        right ^= (right & 137_438_953_471) << 27;
        right ^= right >> 29;
        let word = left ^ right;
        self.words[self.index] = word;
        word
    }

    pub fn next_word(&mut self) -> u64 {
        let value = self.block();
        self.weyl = self.weyl.wrapping_add(WEYL_INCREMENT);
        value.wrapping_add(self.weyl ^ (self.weyl >> 27))
    }

    pub fn next_four_bits(&mut self) -> u8 {
        (self.next_word() >> 60) as u8
    }
}

#[inline]
fn mix(mut value: u64) -> u64 {
    value ^= (value & 18_014_398_509_481_983) << 10;
    value ^= value >> 15;
    value ^= (value & 1_152_921_504_606_846_975) << 4;
    value ^ (value >> 13)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_one_matches_the_pari_2_17_4_stream() {
        let mut random = PariRandom::from_seed(1).unwrap();
        let expected = [
            13_282_407_956_253_574_712,
            7_557_322_358_563_246_340,
            14_991_082_624_209_354_397,
            6_631_139_461_101_160_670,
            10_719_928_016_004_921_607,
            13_845_646_450_878_251_009,
        ];
        for word in expected {
            assert_eq!(random.next_word(), word);
        }
    }
}
